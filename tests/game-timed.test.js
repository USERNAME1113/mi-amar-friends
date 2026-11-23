import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame, submitQuestions, startWriting, canStart, startGame, castVote, publicView, startNewCycle, finishIfReady, QUESTION_TIME_MS} from '../core.js';

const names = ['שמעון', 'סדעון', 'פוסח', 'דניאל'];
const question=(correctIndex=1)=>({text:'משפט של אדם שלא נמצא במשחק',options:[...names],correctIndex});
function fixture() {
  const game = makeGame({id:'a', name:'מארח'});
  for (const id of ['b','c']) game.players.push({id,name:id,active:true,ready:false,score:0,questions:[]});
  startWriting(game);
  for (const player of game.players) submitQuestions(game, player.id, [{text:'משפט של '+player.name,options:names,correctIndex:1}]);
  return game;
}
function voteWithEveryone(game, now) {
  const index = game.questionIndex;
  const q = game.questions[index];
  for (const player of game.players.filter(p => p.id !== q.submittedBy)) {
    assert.equal(castVote(game, player.id, q.owner, index, now), true);
  }
}
test('A lobby starts before writing; every player must submit',()=>{const g=makeGame({id:'a',name:'אור'});assert.equal(startWriting(g),false);assert.equal(submitQuestions(g,'a',[question()]),false);g.players.push({id:'b',active:true,questions:[],score:0});assert.equal(startWriting(g),true);submitQuestions(g,'a',[question()]);assert.equal(canStart(g),false);submitQuestions(g,'b',[question()]);assert.equal(canStart(g),true);});
test('Exactly one sentence and four unique free names are required',()=>{const g=fixture();for(const bad of [[],[question(),question()],[{...question(),options:names.slice(0,3)}],[{...question(),options:[...names,'אחר']}],[{...question(),options:['א','א','ב','ג']}],[{...question(),options:['א','','ב','ג']}],[{...question(),correctIndex:undefined}],[{...question(),correctIndex:4}]])assert.equal(submitQuestions(g,'a',bad),false);assert.equal(submitQuestions(g,'a',[question()]),true);});
test('Everyone sees the same question and a fresh timer after all eligible votes', () => {
  const game = fixture();
  assert.equal(canStart(game), true);
  startGame(game, 1000);
  const q = game.questions[0];
  const voters = game.players.filter(p => p.id !== q.submittedBy);
  assert.equal(publicView(game,'a',1000).text, publicView(game,'b',1000).text);
  assert.equal(castVote(game,q.submittedBy,q.owner,0,1500),false);
  assert.equal(castVote(game,voters[0].id,q.owner,0,1500),true);
  assert.equal(castVote(game,voters[0].id,q.owner,0,1500),false);
  assert.equal(game.questionIndex,0);
  assert.equal(publicView(game,voters[0].id,1500).vote,q.owner);
  assert.equal(castVote(game,voters[1].id,q.owner,0,1600),true);
  assert.equal(game.questionIndex,1);
  assert.equal(publicView(game,'a',1600).remaining,QUESTION_TIME_MS);
  assert.equal(castVote(game,'a',q.owner,0,1700),false);
});
test('The deadline advances without votes and rejects late choices', () => {
  const game = fixture();
  startGame(game, 1000);
  const deadline = 1000 + QUESTION_TIME_MS;
  const q = game.questions[0];
  const voter = game.players.find(p => p.id !== q.submittedBy);
  assert.equal(finishIfReady(game, deadline-1), false);
  assert.equal(castVote(game,voter.id,q.owner,0,deadline),false);
  assert.equal(finishIfReady(game,deadline),true);
  assert.equal(game.questionIndex,1);
  assert.equal(publicView(game,voter.id,deadline).remaining,QUESTION_TIME_MS);
});
test('Scores, submitters and correct answers appear only in the final review', () => {
  const game = fixture();
  startGame(game,1000);
  for (let index=0;index<3;index++) {
    const view = publicView(game,'a',1000);
    assert.equal(view.owner,null);
    assert.deepEqual(view.review,[]);
    assert.ok(view.players.every(p => !Object.hasOwn(p,'score')));
    voteWithEveryone(game,1000+index);
  }
  const view = publicView(game,'b');
  assert.equal(view.phase,'results');
  assert.deepEqual(view.players.map(p => p.score), [2000,2000,2000]);
  assert.equal(view.review.length,3);
  for (const item of view.review) {
    assert.equal(item.text,'משפט של '+item.submittedBy);
    assert.deepEqual(item.options.map(o=>o.name).sort(),[...names].sort());
    assert.equal(item.options.find(o=>o.id===item.owner).name,'סדעון');
  }
  assert.equal(finishIfReady(game),false);
  assert.equal(startNewCycle(game),true);
  assert.deepEqual(publicView(game,'a').review,[]);
  assert.ok(game.players.every(p => p.score===2000 && !p.ready));
});
test('A disconnected voter no longer blocks the next question', () => {
  const game = fixture();
  startGame(game,0);
  const q = game.questions[0];
  const [first,second] = game.players.filter(p => p.id !== q.submittedBy);
  castVote(game,first.id,q.owner,0,1);
  second.active=false;
  assert.equal(finishIfReady(game,2),true);
  assert.equal(game.questionIndex,1);
});
