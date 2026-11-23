import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,submitQuestions,canStart,startGame,castVote,reveal,nextRound,allVoted,publicView,cleanText} from '../core.js';
function fixture() {
  const g=makeGame({id:'a',name:'אור'});
  for(const id of ['b','c'])g.players.push({id,name:id,active:true,ready:false,score:0,questions:[]});
  for(const p of g.players)submitQuestions(g,p.id,['משפט של '+p.id]);
  return g;
}
test('Requires two active players and all submissions',()=>{const g=makeGame({id:'a',name:'אור'});assert.equal(canStart(g),false);g.players.push({id:'b',active:true,questions:[]});submitQuestions(g,'a',['שאלה']);assert.equal(canStart(g),false);submitQuestions(g,'b',['שאלה']);assert.equal(canStart(g),true);});
test('Never discloses answer, tokens, or other submissions during voting',()=>{const g=fixture();g.players[0].token='SECRET';startGame(g,1000);const v=publicView(g,'a',1000);assert.equal(v.owner,null);assert.equal(JSON.stringify(v).includes('SECRET'),false);assert.equal('questions' in v.players[0],false);assert.deepEqual(v.myQuestions,[]);});
test('Author cannot vote, duplicates and late/unknown votes rejected',()=>{const g=fixture();startGame(g,1000);const q=g.questions[0];const voter=g.players.find(p=>p.id!==q.owner).id;assert.equal(castVote(g,q.owner,voter,1100),false);assert.equal(castVote(g,'bad',q.owner,1100),false);assert.equal(castVote(g,voter,'bad',1100),false);assert.equal(castVote(g,voter,q.owner,27000),false);assert.equal(castVote(g,voter,q.owner,1100),true);assert.equal(castVote(g,voter,q.owner,1101),false);});
test('Reveals after all eligible votes; score awarded once',()=>{const g=fixture();startGame(g,1000);const owner=g.questions[0].owner;for(const p of g.players.filter(p=>p.id!==owner))castVote(g,p.id,owner,1000);assert.equal(allVoted(g),true);reveal(g);assert.equal(publicView(g,'a').owner,owner);for(const p of g.players)assert.equal(p.score,p.id===owner?0:1500);assert.equal(reveal(g),false);});
test('Full game ends and cannot skip unanswered rounds',()=>{const g=fixture();startGame(g,1000);assert.equal(nextRound(g,1001),false);while(g.phase!=='results'){reveal(g);nextRound(g,2000);}assert.equal(g.round,3);});
test('Submission validation and maximum length',()=>{const g=fixture();assert.equal(submitQuestions(g,'a',[null,' ']),false);submitQuestions(g,'a',['x'.repeat(500)]);assert.equal(g.players[0].questions[0].length,220);assert.equal(cleanText('hello\u202Eworld'),'helloworld');});
