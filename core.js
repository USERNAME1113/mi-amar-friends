export const MAX_PLAYERS = 20;
export const MAX_QUESTIONS = 1;
export function cleanText(value, max = 220) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u202A-\u202E\u2066-\u2069]/g, '').trim().slice(0, max) : '';
}
export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function makeGame(host) {
  return { phase: 'lobby', cycle: 1, players: [{ ...host, active: true, ready: false, score: 0, questions: [] }], questions: [], answers: {}, awarded: {} };
}
export function submitQuestions(game, id, texts) {
  const p = game.players.find(p => p.id === id);
  if (!p || game.phase !== 'writing' || !Array.isArray(texts) || texts.length !== 1) return false;
  const raw = texts[0], text = cleanText(raw?.text);
  const options = Array.isArray(raw?.options) ? raw.options.map(name => cleanText(name, 40)) : [];
  const correctIndex = raw?.correctIndex;
  if (text.length < 3 || options.length !== 4 || options.some(name => !name) || new Set(options.map(name => name.toLocaleLowerCase())).size !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return false;
  p.questions = [{ text, options, correctIndex }]; p.ready = true; return true;
}
export function startWriting(game) {
  if (game.phase !== 'lobby' || game.players.filter(p => p.active).length < 2) return false;
  game.phase = 'writing'; return true;
}
export function canStart(game) {
  const active = game.players.filter(p => p.active);
  return game.phase === 'writing' && active.length >= 2 && active.every(p => p.ready);
}
export function startGame(game) {
  if (!canStart(game)) return false;
  game.questions = shuffle(game.players.filter(p => p.active).map(p => {
    const q = p.questions[0];
    return { text: q.text, options: shuffle(q.options.map((name, i) => ({ id: 'choice-' + i, name }))), owner: 'choice-' + q.correctIndex, submittedBy: p.id };
  }));
  game.answers = {}; game.awarded = {}; game.phase = 'question'; return true;
}
function questionIndices(game, id) {
  return game.questions.flatMap((q, index) => q.submittedBy === id ? [] : [index]);
}
function progress(game, id) {
  const indices = questionIndices(game, id), answers = game.answers[id] || {};
  const answered = indices.filter(index => Object.hasOwn(answers, index)).length;
  return { answered, total: indices.length, questionIndex: indices.find(index => !Object.hasOwn(answers, index)), finished: answered === indices.length };
}
export function castVote(game, voter, target, questionIndex) {
  const player = game.players.find(p => p.id === voter && p.active);
  if (game.phase !== 'question' || !player || !Number.isInteger(questionIndex)) return false;
  const current = progress(game, voter);
  if (current.finished || current.questionIndex !== questionIndex) return false;
  const q = game.questions[questionIndex];
  if (!q || q.submittedBy === voter || !q.options.some(option => option.id === target)) return false;
  game.answers[voter] ||= {};
  game.answers[voter][questionIndex] = target;
  finishIfReady(game);
  return true;
}
export function finishIfReady(game) {
  if (game.phase !== 'question') return false;
  const active = game.players.filter(p => p.active);
  if (!active.length || !active.every(p => progress(game, p.id).finished)) return false;
  for (const p of game.players) {
    const correct = Object.entries(game.answers[p.id] || {}).filter(([index, choice]) => game.questions[Number(index)]?.owner === choice).length;
    game.awarded[p.id] = correct * 1000;
    p.score += game.awarded[p.id];
  }
  game.phase = 'results'; return true;
}
export function startNewCycle(game) {
  if (game.phase !== 'results' || game.players.filter(p => p.active).length < 2) return false;
  game.cycle++; game.phase = 'writing'; game.questions = []; game.answers = {}; game.awarded = {};
  for (const p of game.players) { p.questions = []; p.ready = false; }
  return true;
}
export function publicView(game, id) {
  const me = game.players.find(p => p.id === id), current = progress(game, id);
  const q = game.phase === 'question' ? game.questions[current.questionIndex] : null;
  const results = game.phase === 'results';
  return {
    phase: game.phase === 'question' && current.finished ? 'waiting' : game.phase,
    cycle: game.cycle, questionIndex: q ? current.questionIndex : null, round: current.answered, total: current.total,
    players: game.players.map(p => {
      const state = progress(game, p.id);
      return { id: p.id, name: p.name, active: p.active, ready: p.ready, count: p.questions.length, answered: state.answered, total: state.total, finished: state.finished,
        ...(results ? { score: p.score, correct: (game.awarded[p.id] || 0) / 1000 } : {}) };
    }),
    text: q?.text || '', options: q?.options || [], vote: null, owner: null, ownQuestion: false,
    awarded: results ? game.awarded : {},
    myQuestions: game.phase === 'writing' ? me?.questions || [] : [],
  };
}
