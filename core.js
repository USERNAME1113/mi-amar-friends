export const MAX_PLAYERS = 20;
export const MAX_QUESTIONS = 5;
export function cleanText(value, max = 220) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u202A-\u202E\u2066-\u2069]/g, '').trim().slice(0, max) : '';
}
export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function makeGame(host) {
  return { phase: 'lobby', players: [{ ...host, active: true, ready: false, score: 0, questions: [] }], questions: [], round: -1, votes: {}, duration: 25, roundLimit: 0, deadline: 0, awarded: {} };
}
export function submitQuestions(game, id, texts) {
  const p = game.players.find(p => p.id === id);
  if (!p || game.phase !== 'writing' || !Array.isArray(texts)) return false;
  const questions = texts.slice(0, MAX_QUESTIONS).map(t => cleanText(t)).filter(t => t.length >= 3);
  if (!questions.length) return false;
  p.questions = questions; p.ready = true; return true;
}
export function startWriting(game) {
  if (game.phase !== 'lobby' || game.players.filter(p => p.active).length < 2) return false;
  game.phase = 'writing'; return true;
}
export function canStart(game) {
  const active = game.players.filter(p => p.active);
  return game.phase === 'writing' && active.length >= 2 && active.every(p => p.ready);
}
export function startGame(game, now = Date.now()) {
  if (!canStart(game)) return false;
  const all = game.players.filter(p => p.active).flatMap(p => p.questions.map(text => ({ text, owner: p.id })));
  game.questions = shuffle(all).slice(0, game.roundLimit || all.length);
  game.round = -1; return nextRound(game, now);
}
export function nextRound(game, now = Date.now()) {
  if (!['writing', 'reveal'].includes(game.phase)) return false;
  game.round++; game.votes = {}; game.awarded = {};
  if (game.round >= game.questions.length) { game.phase = 'results'; return true; }
  game.phase = 'question'; game.started = now; game.deadline = now + game.duration * 1000; return true;
}
export function castVote(game, voter, target, now = Date.now()) {
  const q = game.questions[game.round];
  if (game.phase !== 'question' || now > game.deadline || !q || q.owner === voter || Object.hasOwn(game.votes, voter)) return false;
  if (!game.players.some(p => p.id === voter && p.active) || !game.players.some(p => p.id === target)) return false;
  game.votes[voter] = { target, at: Math.max(now, game.started) }; return true;
}
export function eligibleVoters(game) {
  const q = game.questions[game.round];
  return q ? game.players.filter(p => p.active && p.id !== q.owner) : [];
}
export function allVoted(game) {
  return game.phase === 'question' && eligibleVoters(game).every(p => Object.hasOwn(game.votes, p.id));
}
export function reveal(game) {
  if (game.phase !== 'question') return false;
  const q = game.questions[game.round]; game.phase = 'reveal';
  for (const p of game.players) {
    const vote = game.votes[p.id];
    const delta = vote?.target === q.owner ? 1000 + Math.round(500 * Math.max(0, 1 - (vote.at - game.started) / (game.duration * 1000))) : 0;
    game.awarded[p.id] = delta; p.score += delta;
  }
  return true;
}
export function publicView(game, id, now = Date.now()) {
  const q = game.questions[game.round], me = game.players.find(p => p.id === id);
  return {
    phase: game.phase, players: game.players.map(({ id, name, active, ready, score, questions }) => ({ id, name, active, ready, score, count: questions.length })),
    round: game.round, total: game.questions.length, duration: game.duration, roundLimit: game.roundLimit,
    remaining: Math.max(0, game.deadline - now), text: q?.text || '',
    ownQuestion: q?.owner === id, owner: game.phase === 'reveal' ? q?.owner : null,
    vote: game.votes[id]?.target || null, voted: Object.keys(game.votes).length,
    eligible: eligibleVoters(game).length, awarded: game.phase === 'reveal' ? game.awarded : {},
    myQuestions: game.phase === 'writing' ? me?.questions || [] : [],
  };
}
