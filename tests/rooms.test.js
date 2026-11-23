import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRoomCode,isRoomCode,roomPeerIds} from '../rooms.js';
test('Pasted codes accept lowercase, separators, and RTL formatting',()=>{
  assert.equal(normalizeRoomCode('\u200f fg6-4sx \u200e'),'FG64SX');
  assert.equal(isRoomCode('\u200f fg6-4sx \u200e'),true);
  assert.equal(isRoomCode('FG64S'),false);
  assert.equal(isRoomCode('FG64SX7'),false);
});
test('Every code resolves both published room namespaces',()=>{
  assert.deepEqual(roomPeerIds('fg64sx'),['mwparty-v1-FG64SX','mwparty-v2-FG64SX']);
});
