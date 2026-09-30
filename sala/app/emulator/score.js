/*
 * The score decoder: it reads the score and the in-game flag of an emulated game
 * out of a core savestate.
 *
 * The catalogue (`score` in jogos.yml) says where to look -- the savestate
 * offsets of the packed-BCD bytes, most significant first, a multiplier for the
 * digits the game does not store, and the byte that tells a match from the
 * attract screen. Nothing here knows a game by name, so one catalogue entry is
 * all a new game needs.
 */
(function () {
  'use strict';

  // One packed-BCD byte holds two decimal digits; anything else is not a score.
  var pair = function (byte) {
    var high = byte >> 4;
    var low = byte & 0x0f;
    if (high > 9 || low > 9) {
      return null;
    }
    return high * 10 + low;
  };

  // The score of a savestate, or null when the state is too short or one of the
  // nibbles is not decimal. Each byte is two digits and the first offset is the
  // most significant, so the bytes read as one base-100 number.
  var readScore = function (state, block) {
    var value = 0;
    var digits;
    var i;
    for (i = 0; i < block.bcd.length; i += 1) {
      if (block.bcd[i] >= state.length) {
        return null;
      }
      digits = pair(state[block.bcd[i]]);
      if (digits === null) {
        return null;
      }
      value = value * 100 + digits;
    }
    return value * block.multiplier;
  };

  // Whether the player has a match running. A savestate too short to hold the
  // flag is not one: reading past the end would make a `not` flag look true and
  // hand the site a score of the attract demo.
  var readInGame = function (state, block) {
    if (block.inGame.offset >= state.length) {
      return false;
    }
    if (block.inGame.is !== undefined) {
      return state[block.inGame.offset] === block.inGame.is;
    }
    return state[block.inGame.offset] !== block.inGame.not;
  };

  window.SalaScore = {
    // {inGame: boolean, score: int|null} for one savestate and one score block.
    decode: function (state, block) {
      if (!state || !block || typeof state.length !== 'number') {
        return null;
      }
      return { inGame: readInGame(state, block), score: readScore(state, block) };
    }
  };
})();
