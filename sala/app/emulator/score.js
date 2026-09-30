/*
 * The score decoder: it reads the score and the in-game flag of an emulated game
 * out of a core savestate.
 *
 * The catalogue (`score` in jogos.yml) says where to look -- the savestate
 * offsets of the score bytes, a multiplier for the digits the game does not
 * store, and the byte (or bytes) that tell a match from the attract screen.
 * Nothing here knows a game by name, so one catalogue entry is all a new game
 * needs.
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

  // A score of one decimal digit per byte, most significant first: the byte is
  // the digit shifted into place (`code = digit << digitShift`), and the code of
  // an empty cell (`blank`) counts as a zero, because the game suppresses the
  // leading zeros of its own HUD. A byte with anything in the low bits, or with
  // a shifted value outside 0-9, is not a score at all.
  var readDigits = function (state, block) {
    var shift = block.digitShift || 0;
    var mask = (1 << shift) - 1;
    var value = 0;
    var code;
    var digit;
    var i;
    for (i = 0; i < block.digits.length; i += 1) {
      if (block.digits[i] >= state.length) {
        return null;
      }
      code = state[block.digits[i]];
      if (code === block.blank) {
        digit = 0;
      } else {
        if (mask !== 0 && (code & mask) !== 0) {
          return null;
        }
        digit = code >> shift;
        if (digit > 9) {
          return null;
        }
      }
      value = value * 10 + digit;
    }
    return value * block.multiplier;
  };

  // The score of a savestate, or null when the state is too short or one of the
  // bytes is not a digit. `bcd` bytes are two digits each and read as one
  // base-100 number; `digits` bytes are one digit each.
  var readScore = function (state, block) {
    if (block.digits) {
      return readDigits(state, block);
    }
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

  // One test of the in-game flag. A savestate too short to hold the byte is not
  // in game: reading past the end would make a `not` test look true and hand the
  // site a score of the attract demo.
  var readInGameTest = function (state, test) {
    if (test.offset >= state.length) {
      return false;
    }
    if (test.is !== undefined) {
      return state[test.offset] === test.is;
    }
    return state[test.offset] !== test.not;
  };

  // Whether the player has a match running. Some games need more than one byte
  // to say it: Pitfall! freezes the frame and plays the death tune at the same
  // time (any of the two is a match), and River Raid's lives cell is blank
  // outside a match and zero for the first frames after power-on, when the
  // demonstration's score is already in memory (both have to hold).
  var readInGame = function (state, block) {
    var flag = block.inGame;
    var tests;
    var i;
    if (flag.any) {
      tests = flag.any;
      for (i = 0; i < tests.length; i += 1) {
        if (readInGameTest(state, tests[i])) {
          return true;
        }
      }
      return false;
    }
    if (flag.all) {
      tests = flag.all;
      for (i = 0; i < tests.length; i += 1) {
        if (!readInGameTest(state, tests[i])) {
          return false;
        }
      }
      return true;
    }
    return readInGameTest(state, flag);
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
