/**
 * Calls Gemini API for the first step of a guide session
 * @param {string} apiKey
 * @param {string} question
 * @param {Object} domInfo
 * @returns {Promise<{done: boolean, step?: Object, summary?: string, stepNumber?: number}>}
 */
async function callGeminiFirstStep(apiKey, question, domInfo) {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await _callGeminiOnce(apiKey, _buildAgentPrompt(question, null, domInfo));
    } catch (err) {
      if (err._isRateLimit && attempt < MAX_RETRIES) {
        const waitMs = (attempt + 1) * 10000;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Calls Gemini API for subsequent steps
 * @param {string} apiKey
 * @param {Object} context - { goal, completedSteps }
 * @param {Object} domInfo
 * @returns {Promise<{done: boolean, step?: Object, summary?: string}>}
 */
async function callGeminiNextStep(apiKey, context, domInfo) {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await _callGeminiOnce(apiKey, _buildAgentPrompt(context.goal, context.completedSteps, domInfo));
    } catch (err) {
      if (err._isRateLimit && attempt < MAX_RETRIES) {
        const waitMs = (attempt + 1) * 10000;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
}

function _buildAgentPrompt(goal, completedSteps, domInfo) {
  const domInfoStr = JSON.stringify(domInfo, null, 0);
  const truncatedDomInfo = domInfoStr.length > 20000
    ? domInfoStr.substring(0, 20000) + '...(truncated)'
    : domInfoStr;

  const completedStepsStr = completedSteps && completedSteps.length > 0
    ? completedSteps.map(s => `- ステップ${s.stepNumber}: ${s.action}（${s.page}）`).join('\n')
    : 'なし';

  return `あなたはウェブアプリケーションの操作ガイドエージェントです。
ユーザーの目的と、これまでに完了した操作、そして現在のページのDOM情報に基づき、
次に行うべき操作を1つだけ判断してください。

## ユーザーの目的
${goal}

## 完了済みステップ
${completedStepsStr}

## 現在のページ
タイトル: ${domInfo.title}
URL: ${domInfo.url}

## 現在のページのDOM情報
${truncatedDomInfo}

## 回答形式
次の操作がある場合:
{
  "done": false,
  "step": {
    "action": "click",
    "selector": "CSSセレクタ",
    "description": "操作の説明",
    "fallback": {
      "text": "要素のテキスト",
      "approximatePosition": { "top": "20%", "left": "80%" }
    }
  }
}

目的が達成済みの場合:
{
  "done": true,
  "summary": "完了の要約"
}

注意:
- selectorが動的クラス名（ランダム文字列を含む）に依存する場合は、必ずfallback.textを付与すること
- 1つの操作のみを返すこと。複数ステップをまとめないこと
- JSONのみを返し、それ以外のテキストは含めないでください`;
}

async function _callGeminiOnce(apiKey, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    if (response.status === 429) {
      const err = new Error('APIのレート制限に達しました。しばらく待ってから再試行してください。');
      err._isRateLimit = true;
      throw err;
    }
    if (response.status === 400) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`APIエラー: ${err.error?.message || 'リクエストが無効です'}`);
    }
    if (response.status === 403) {
      throw new Error('APIキーが無効です。設定を確認してください。');
    }
    throw new Error(`APIエラー (${response.status})`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('Geminiからの応答が空です');
  }

  return parseGeminiResponse(rawText);
}

function parseGeminiResponse(rawText) {
  let jsonText = rawText.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Geminiの応答のパースに失敗しました: ${rawText.substring(0, 200)}`);
  }

  // done: true の場合
  if (parsed.done === true) {
    return { done: true, summary: parsed.summary || '目的が達成されました' };
  }

  // done: false の場合
  if (parsed.done === false && parsed.step) {
    return {
      done: false,
      step: {
        action: parsed.step.action || 'click',
        selector: parsed.step.selector || '',
        description: parsed.step.description || '操作してください',
        fallback: parsed.step.fallback || null
      }
    };
  }

  // 旧形式（steps配列）への互換処理
  if (parsed.steps && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
    const s = parsed.steps[0];
    return {
      done: false,
      step: {
        action: s.action || 'click',
        selector: s.selector || '',
        description: s.description || '操作してください',
        fallback: s.fallback || null
      }
    };
  }

  throw new Error('Geminiの応答の形式が不正です');
}
