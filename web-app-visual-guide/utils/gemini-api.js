/**
 * Calls Gemini API with screenshot and DOM info to get step-by-step guide
 * @param {string} apiKey
 * @param {string} userQuestion
 * @param {string} screenshotBase64 - base64 without data URI prefix
 * @param {Object} domInfo
 * @returns {Promise<{steps: Array, summary: string}>}
 */
async function callGemini(apiKey, userQuestion, screenshotBase64, domInfo) {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGeminiOnce(apiKey, userQuestion, screenshotBase64, domInfo);
    } catch (err) {
      if (err._isRateLimit && attempt < MAX_RETRIES) {
        const waitMs = (attempt + 1) * 10000; // 10s, 20s, 30s
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
}

async function callGeminiOnce(apiKey, userQuestion, screenshotBase64, domInfo) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const domInfoStr = JSON.stringify(domInfo, null, 0);
  // Limit DOM info size to avoid exceeding token limits
  const truncatedDomInfo = domInfoStr.length > 20000
    ? domInfoStr.substring(0, 20000) + '...(truncated)'
    : domInfoStr;

  const prompt = `あなたはウェブアプリケーションの操作ガイドアシスタントです。
ユーザーの質問と、現在表示されているウェブページのスクリーンショット及びDOM情報を分析し、
ユーザーが目的を達成するために操作すべきUI要素を特定してください。

## ユーザーの質問
${userQuestion}

## 現在のページのDOM情報
${truncatedDomInfo}

## 回答形式
以下のJSON形式で回答してください。JSONのみを返し、それ以外のテキストは含めないでください。

{
  "steps": [
    {
      "stepNumber": 1,
      "action": "click",
      "selector": "CSSセレクタ",
      "description": "このボタンをクリックしてください",
      "fallback": {
        "text": "要素に表示されているテキスト",
        "role": "button",
        "approximatePosition": { "top": "20%", "left": "80%" }
      }
    }
  ],
  "summary": "操作全体の要約"
}`;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: screenshotBase64
          }
        }
      ]
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
  // Strip markdown code block if present
  let jsonText = rawText.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  // Try to extract JSON object
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

  if (!parsed.steps || !Array.isArray(parsed.steps)) {
    throw new Error('Geminiの応答にstepsが含まれていません');
  }

  // Normalize steps
  parsed.steps = parsed.steps.map((step, idx) => ({
    stepNumber: step.stepNumber ?? idx + 1,
    action: step.action || 'click',
    selector: step.selector || '',
    description: step.description || `ステップ ${idx + 1}`,
    fallback: step.fallback || null
  }));

  return parsed;
}
