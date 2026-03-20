class GuideSession {
  constructor(userQuestion) {
    this.userQuestion = userQuestion;
    this.history = [];
    this.status = 'active'; // 'active' | 'completed'
  }

  addStep(step, pageTitle, pageUrl) {
    this.history.push({
      step,
      pageTitle,
      pageUrl,
      timestamp: Date.now()
    });
  }

  // AIに送るコンテキスト構築
  buildContext() {
    return {
      goal: this.userQuestion,
      completedSteps: this.history.map((h, i) => ({
        stepNumber: i + 1,
        action: h.step.description,
        page: h.pageTitle
      }))
    };
  }

  toJSON() {
    return {
      userQuestion: this.userQuestion,
      history: this.history,
      status: this.status
    };
  }

  static fromJSON(obj) {
    const session = new GuideSession(obj.userQuestion);
    session.history = obj.history || [];
    session.status = obj.status || 'active';
    return session;
  }
}
