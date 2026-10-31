#!/usr/bin/env python3
"""Build the .sb3 projects for the Scratch course (Santana, Bahia, Brazil).

Reproducible: downloads the official Scratch assets into tools/assets-cache/,
checks that each file's md5 equals the md5 in the asset's own file name (a
Scratch 3 requirement) and writes the .sb3 files.

The md5 names of the library assets come from the official scratch-gui JSONs
(src/lib/libraries/{backdrops,sprites,costumes,sounds}.json) and from the asset
API (https://cdn.assets.scratch.mit.edu/internalapi/asset/<md5ext>/get/).
Some costumes (the pong court, paddles and ball) are drawn by this script
instead; they follow the same rule, the asset id is the md5 of the bytes.

projetos/ holds the starters the kids open in class; demos/ holds the finished
games (not copied into the student image by distro, which only ships
projetos/*.sb3).

Aula5-PongInicio.sb3 is the file the class built in meeting 10, committed as the
teacher saved it and only validated here. Aula5-Pong-pronto.sb3 is that same
file with the meeting's two steps patched in (Sb3File), so the demo and the
projector always show one project.

The music starters (Aulas 6 and 7) are drawn here too; their demos are the
starter with one of our own MP3s (src/sons/, written by tools/build_sons.py)
and the class's two scripts patched in, the same way. Those MP3s are decoded
with ffmpeg here, because a Scratch sound carries the rate and sample count of
its decoded audio, not of the MP3 header.

Usage:
    python3 tools/build_sb3.py           # build every .sb3 project
    python3 tools/build_sb3.py --check   # validate the generated .sb3 files
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / "assets-cache"
CDN = "https://cdn.assets.scratch.mit.edu/internalapi/asset/{}/get/"

# ---------------------------------------------------------------------------
# Compressed input primitives (exactly the format Scratch writes on save)
# ---------------------------------------------------------------------------

MATH_NUMBER = 4
POSITIVE_NUMBER = 5
WHOLE_NUMBER = 6
INTEGER_NUMBER = 7
ANGLE = 8
TEXT = 10
BROADCAST_PRIMITIVE = 11
VARIABLE_PRIMITIVE = 12
LIST_PRIMITIVE = 13

INPUT_SAME_BLOCK_SHADOW = 1
INPUT_BLOCK_NO_SHADOW = 2
INPUT_DIFF_BLOCK_SHADOW = 3


def prim_num(value) -> list:
    return [MATH_NUMBER, str(value)]


def prim_positive(value) -> list:
    return [POSITIVE_NUMBER, str(value)]


def prim_whole(value) -> list:
    return [WHOLE_NUMBER, str(value)]


def prim_angle(value) -> list:
    return [ANGLE, str(value)]


def prim_text(value) -> list:
    return [TEXT, str(value)]


def i_num(value) -> list:
    """Input with a number shadow (e.g. STEPS, SECS, X, Y)."""
    return [INPUT_SAME_BLOCK_SHADOW, prim_num(value)]


def i_positive(value) -> list:
    """Input with a positive number shadow (e.g. DURATION of `wait`)."""
    return [INPUT_SAME_BLOCK_SHADOW, prim_positive(value)]


def i_whole(value) -> list:
    """Input with a whole number shadow (e.g. TIMES of `repeat`)."""
    return [INPUT_SAME_BLOCK_SHADOW, prim_whole(value)]


def i_angle(value) -> list:
    """Input with an angle shadow (e.g. DIRECTION of `point in direction`)."""
    return [INPUT_SAME_BLOCK_SHADOW, prim_angle(value)]


def i_text(value) -> list:
    """Input with a text shadow (e.g. MESSAGE, VALUE of `set ... to`)."""
    return [INPUT_SAME_BLOCK_SHADOW, prim_text(value)]


def i_block(block_id: str) -> list:
    """Boolean/substack input: no shadow at all."""
    return [INPUT_BLOCK_NO_SHADOW, block_id]


def i_plug(block_id: str, shadow: list) -> list:
    """Reporter plugged into an input that owns a shadow (shadow stays hidden)."""
    return [INPUT_DIFF_BLOCK_SHADOW, block_id, shadow]


def i_plug_menu(block_id: str, menu_id: str) -> list:
    """Reporter plugged into an input whose shadow is a menu block.

    Scratch stores the hidden menu shadow as a bare block id, not as the
    `[1, id]` descriptor used when the menu itself is the input, so the
    caller passes the shadow block id itself (`Target.menu(...)[1]`).
    """
    return [INPUT_DIFF_BLOCK_SHADOW, block_id, menu_id]


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------


def costume(name: str, md5ext: str, rcx, rcy, bitmap_resolution: int = 1) -> dict:
    md5, _, ext = md5ext.partition(".")
    return {
        "name": name,
        "bitmapResolution": bitmap_resolution,
        "dataFormat": ext,
        "assetId": md5,
        "md5ext": md5ext,
        "rotationCenterX": rcx,
        "rotationCenterY": rcy,
    }


def sound(name: str, md5ext: str, rate: int, sample_count: int, fmt: str = "") -> dict:
    md5, _, ext = md5ext.partition(".")
    return {
        "name": name,
        "assetId": md5,
        "dataFormat": ext,
        "format": fmt,
        "rate": rate,
        "sampleCount": sample_count,
        "md5ext": md5ext,
    }


# Official Scratch assets (file name == md5 of the content).
CAT_A = costume("cat-a", "bcf454acf82e4504149f7ffe07081dbc.svg", 48, 50)
CAT_B = costume("cat-b", "0fb9be3e8397c983338cb71dc84d0b25.svg", 46, 53)
MEOW = sound("Meow", "83c36d806dc92327b9e7049a565c6bff.wav", 44100, 37376)
POP = sound("Pop", "83a9787d4cb6f3b7632b4ddfebf74367.wav", 44100, 1032)
POP_LOWER = sound("pop", "83a9787d4cb6f3b7632b4ddfebf74367.wav", 44100, 1032)

BALLOON = [
    costume("balloon1-a", "d7974f9e15000c16222f94ee32d8227a.svg", 32, 94),
    costume("balloon1-b", "a2516ac2b8d7a348194908e630387ea9.svg", 31, 94),
    costume("balloon1-c", "63e5aea255610f9fdf0735e1e9a55a5c.svg", 31, 94),
]
GIFT = [
    costume("gift-a", "0fdd104de718c5fc4a65da429468bdbd.svg", 33, 25),
    costume("gift-b", "6cbeda5d391c6d107f0b853222f344d9.svg", 33, 26),
]
APPLE = [costume("apple", "3826a4091a33e4d26f87a2fac7cf796b.svg", 31, 31)]
BANANAS = [costume("bananas", "e5d3d3eb61797f5999732a8f5efead24.svg", 39, 38)]
ORANGE = [costume("orange", "d0a55aae1decb57152b454c9a5226757.svg", 19, 18)]
WATERMELON = [costume("watermelon-a", "21d1340478e32a942914a7afd12b9f1a.svg",
                      40.13434982299805, 27.860475540161133)]
STRAWBERRY = [costume("strawberry-a", "2fa57942dc7ded7eddc4d41554768d67.svg", 31, 47)]
BOWL = [costume("bowl-a", "d147f16e3e2583719c073ac5b55fe3ca.svg", 30, 15)]
STAR = [costume("star", "551629f2a64c1f3703e57aaa133effa6.svg", 22, 23)]

BACKDROP_BLUE_SKY = costume("Blue Sky", "e7c147730f19d284bcd7b3f00af19bb6.svg", 240, 180)
BACKDROP_XY_GRID = costume("Xy-grid", "9838d02002d05f88dc54d96494fbc202.png", 480, 360, bitmap_resolution=2)


def local_costume(project, name: str, svg: str, rcx, rcy) -> dict:
    """A costume drawn by this script (pong court, paddles, ball).

    The asset id is the md5 of the bytes, exactly like a library asset, so the
    generated .sb3 stays valid and deterministic.
    """
    data = svg.encode("utf-8")
    md5ext = f"{hashlib.md5(data).hexdigest()}.svg"
    project.generated[md5ext] = data
    return costume(name, md5ext, rcx, rcy)


def sound_file(name: str, path: Path) -> tuple[dict, bytes]:
    """A sound entry for a file we ship, plus its bytes.

    Scratch takes `rate` and `sampleCount` from the decoded audio, not from
    the MP3 header, so the file is decoded once with ffmpeg and counted.
    """
    data = path.read_bytes()
    try:
        rate = int(subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
             "stream=sample_rate", "-of", "csv=p=0", str(path)],
            capture_output=True, check=True, text=True).stdout.strip())
        pcm = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1",
             "-ar", str(rate), "-"],
            capture_output=True, check=True).stdout
    except FileNotFoundError as error:
        raise SystemExit(f"faltou o {error.filename}: instale o ffmpeg para ler "
                         f"{path.relative_to(ROOT)}") from error
    md5ext = f"{hashlib.md5(data).hexdigest()}.mp3"
    return sound(name, md5ext, rate, len(pcm) // 2), data


def fetch_asset(md5ext: str) -> bytes:
    """Return the asset content, downloading it into the cache when needed.

    Checks that md5(content) == md5 in the file name: Scratch uses that md5 as
    the asset id, so the bytes must match exactly.
    """
    path = CACHE / md5ext
    if path.exists():
        data = path.read_bytes()
    else:
        CACHE.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(CDN.format(md5ext), timeout=60) as response:
            data = response.read()
        path.write_bytes(data)
    expected = md5ext.partition(".")[0]
    got = hashlib.md5(data).hexdigest()
    if got != expected:
        raise SystemExit(f"md5 nao confere para {md5ext}: arquivo tem {got}")
    return data


# ---------------------------------------------------------------------------
# project.json assembly
# ---------------------------------------------------------------------------


def slug(name: str) -> str:
    """Readable, stable block/variable id derived from an accented name."""
    flat = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    out = []
    for char in flat.lower():
        out.append(char if char.isalnum() else "_")
    return "".join(out).strip("_") or "x"


class Var:
    """A variable: global when it lives on the stage, else sprite-local."""

    def __init__(self, name: str, value, var_id: str | None = None):
        self.name = name
        self.value = value
        self.id = var_id or f"var_{slug(name)}"

    def entry(self) -> list:
        return [self.name, self.value]

    def field(self) -> list:
        """Value of a block's VARIABLE field."""
        return [self.name, self.id]

    def reporter(self) -> list:
        """Input holding a `data_variable` reporter."""
        return [INPUT_SAME_BLOCK_SHADOW, [VARIABLE_PRIMITIVE, self.name, self.id]]


class Broadcast:
    def __init__(self, name: str, bcast_id: str | None = None):
        self.name = name
        self.id = bcast_id or f"msg_{slug(name)}"

    def field(self) -> list:
        return [self.name, self.id]

    def field_dict(self) -> dict:
        return {"BROADCAST_OPTION": self.field()}

    def signal(self) -> list:
        """BROADCAST_INPUT input of `event_broadcast`."""
        return [INPUT_SAME_BLOCK_SHADOW, [BROADCAST_PRIMITIVE, self.name, self.id]]


class Target:
    """One project target (the stage or a sprite) with its own blocks."""

    def __init__(self, name, is_stage=False, layer_order=0, x=0, y=0, size=100,
                 direction=90, visible=True, draggable=False,
                 rotation_style="all around"):
        self.name = name
        self.is_stage = is_stage
        self.layer_order = layer_order
        self.x = x
        self.y = y
        self.size = size
        self.direction = direction
        self.visible = visible
        self.draggable = draggable
        self.rotation_style = rotation_style
        self.variables: dict[str, list] = {}
        self.lists: dict[str, list] = {}
        self.broadcasts: dict[str, str] = {}
        self.blocks: dict[str, dict] = {}
        self.comments: dict[str, dict] = {}
        self.costumes: list = []
        self.sounds: list = []
        self.current_costume = 0
        self.volume = 100
        self.tempo = 60
        self.video_state = "off"
        self.video_transparency = 50
        self.text_to_speech_language = None
        self._counter = 0

    # -- ids -----------------------------------------------------------------
    def _new_id(self, prefix: str) -> str:
        self._counter += 1
        return f"{prefix}{self._counter}"

    # -- blocks --------------------------------------------------------------
    def add(self, opcode: str, inputs: dict | None = None, fields: dict | None = None,
            mutation: dict | None = None) -> str:
        block_id = self._new_id("b")
        block = {
            "opcode": opcode,
            "next": None,
            "parent": None,
            "inputs": inputs or {},
            "fields": fields or {},
            "shadow": False,
            "topLevel": False,
        }
        if mutation is not None:
            block["mutation"] = mutation
        self.blocks[block_id] = block
        return block_id

    def shadow(self, opcode: str, fields: dict) -> str:
        block_id = self._new_id("s")
        self.blocks[block_id] = {
            "opcode": opcode,
            "next": None,
            "parent": None,
            "inputs": {},
            "fields": fields,
            "shadow": True,
            "topLevel": False,
        }
        return block_id

    def menu(self, opcode: str, field: str, value) -> list:
        """Input whose menu is its own shadow block (e.g. a sound or a costume)."""
        return [INPUT_SAME_BLOCK_SHADOW, self.shadow(opcode, {field: [value, None]})]

    def chain(self, *block_ids: str) -> str:
        for prev, nxt in zip(block_ids, block_ids[1:]):
            self.blocks[prev]["next"] = nxt
            self.blocks[nxt]["parent"] = prev
        return block_ids[0]

    def script(self, x: int, y: int, *block_ids: str) -> str:
        """Build a whole script: the first block becomes the top of the stack."""
        first = self.chain(*block_ids)
        self.blocks[first]["topLevel"] = True
        self.blocks[first]["x"] = x
        self.blocks[first]["y"] = y
        return first

    def substack(self, owner: str, *block_ids: str) -> list:
        self.chain(*block_ids)
        self.blocks[block_ids[0]]["parent"] = owner
        return i_block(block_ids[0])

    # -- compound blocks -----------------------------------------------------
    def forever(self, *body) -> str:
        block = self.add("control_forever")
        self.blocks[block]["inputs"]["SUBSTACK"] = self.substack(block, *body)
        return block

    def repeat(self, times, *body) -> str:
        block = self.add("control_repeat", {"TIMES": i_whole(times)})
        self.blocks[block]["inputs"]["SUBSTACK"] = self.substack(block, *body)
        return block

    def repeat_until(self, condition, *body) -> str:
        block = self.add("control_repeat_until", {"CONDITION": i_block(condition)})
        self.blocks[block]["inputs"]["SUBSTACK"] = self.substack(block, *body)
        return block

    def if_(self, condition, *body) -> str:
        block = self.add("control_if", {"CONDITION": i_block(condition)})
        self.blocks[block]["inputs"]["SUBSTACK"] = self.substack(block, *body)
        return block

    def if_else(self, condition, then_body, else_body) -> str:
        block = self.add("control_if_else", {"CONDITION": i_block(condition)})
        self.blocks[block]["inputs"]["SUBSTACK"] = self.substack(block, *then_body)
        self.blocks[block]["inputs"]["SUBSTACK2"] = self.substack(block, *else_body)
        return block

    def wait_until(self, condition) -> str:
        return self.add("control_wait_until", {"CONDITION": i_block(condition)})

    # -- block shorthands ----------------------------------------------------
    # Numeric/text inputs accept three shapes:
    #   * a plain literal (wrapped in the right shadow primitive),
    #   * an input descriptor such as `plug_num(block)` (used as is),
    #   * a bare block id (a reporter built with `op(...)`), which gets plugged in.
    def _num_input(self, value) -> list:
        if isinstance(value, list):
            return value
        if isinstance(value, str) and value in self.blocks:
            return i_plug(value, prim_num(""))
        return i_num(value)

    def _text_input(self, value) -> list:
        if isinstance(value, list):
            return value
        if isinstance(value, str) and value in self.blocks:
            return i_plug(value, prim_text(""))
        return i_text(value)

    def hat(self, opcode: str) -> str:
        return self.add(opcode)

    def start_on_broadcast(self, message: Broadcast) -> str:
        return self.add("event_whenbroadcastreceived", fields=message.field_dict())

    def send(self, message: Broadcast) -> str:
        return self.add("event_broadcast", {"BROADCAST_INPUT": message.signal()})

    def send_and_wait(self, message: Broadcast) -> str:
        return self.add("event_broadcastandwait", {"BROADCAST_INPUT": message.signal()})

    def set_var(self, variable: Var, value) -> str:
        return self.add("data_setvariableto", {"VALUE": value},
                        {"VARIABLE": variable.field()})

    def change_var(self, variable: Var, delta) -> str:
        return self.add("data_changevariableby", {"VALUE": delta},
                        {"VARIABLE": variable.field()})

    def show_var(self, variable: Var) -> str:
        return self.add("data_showvariable", fields={"VARIABLE": variable.field()})

    def say(self, message) -> str:
        return self.add("looks_say", {"MESSAGE": message})

    def say_for(self, message, seconds) -> str:
        return self.add("looks_sayforsecs", {"MESSAGE": self._text_input(message),
                                             "SECS": self._num_input(seconds)})

    def wait(self, seconds) -> str:
        return self.add("control_wait", {"DURATION": i_positive(seconds)})

    def go_to(self, x, y) -> str:
        return self.add("motion_gotoxy", {"X": self._num_input(x), "Y": self._num_input(y)})

    def glide_to_xy(self, seconds, x, y) -> str:
        return self.add("motion_glidesecstoxy", {"SECS": self._num_input(seconds),
                                                 "X": self._num_input(x), "Y": self._num_input(y)})

    def switch_costume(self, costume_name: str) -> str:
        return self.add("looks_switchcostumeto",
                        {"COSTUME": self.menu("looks_costume", "COSTUME", costume_name)})

    def play_sound(self, sound_name: str) -> str:
        return self.add("sound_play",
                        {"SOUND_MENU": self.menu("sound_sounds_menu", "SOUND_MENU", sound_name)})

    def play_sound_until_done(self, sound_name: str) -> str:
        return self.add("sound_playuntildone",
                        {"SOUND_MENU": self.menu("sound_sounds_menu", "SOUND_MENU", sound_name)})

    def touching(self, sprite_name: str) -> str:
        return self.add("sensing_touchingobject",
                        {"TOUCHINGOBJECTMENU": self.menu("sensing_touchingobjectmenu",
                                                        "TOUCHINGOBJECTMENU", sprite_name)})

    def set_drag_mode(self, draggable: bool) -> str:
        mode = "draggable" if draggable else "not draggable"
        return self.add("sensing_setdragmode", fields={"DRAG_MODE": [mode, None]})

    def stop_this_script(self) -> str:
        return self.add("control_stop", fields={"STOP_OPTION": ["this script", None]},
                        mutation={"tagName": "mutation", "children": [], "hasnext": "false"})

    def ask(self, question) -> str:
        return self.add("sensing_askandwait", {"QUESTION": i_text(question)})

    # -- reporters -----------------------------------------------------------
    def op(self, opcode: str, fields: dict | None = None, **inputs) -> str:
        return self.add(opcode, inputs, fields)

    def rep_var(self, variable: Var) -> str:
        """Reporter block for a variable (wrap with `plug` to use it as input)."""
        return self.add("data_variable", fields={"VARIABLE": variable.field()})

    def num(self, value) -> list:
        return i_num(value)

    def text(self, value) -> list:
        return i_text(value)

    def plug(self, block_id: str, shadow: list) -> list:
        return i_plug(block_id, shadow)

    def plug_num(self, block_id: str) -> list:
        return i_plug(block_id, prim_num(""))

    def plug_text(self, block_id: str) -> list:
        return i_plug(block_id, prim_text(""))

    def to_dict(self) -> dict:
        data = {
            "isStage": self.is_stage,
            "name": self.name,
            "variables": self.variables,
            "lists": self.lists,
            "broadcasts": self.broadcasts,
            "blocks": self.blocks,
            "comments": self.comments,
            "currentCostume": self.current_costume,
            "costumes": self.costumes,
            "sounds": self.sounds,
            "volume": self.volume,
            "layerOrder": self.layer_order,
        }
        if self.is_stage:
            data.update({
                "tempo": self.tempo,
                "videoTransparency": self.video_transparency,
                "videoState": self.video_state,
                "textToSpeechLanguage": self.text_to_speech_language,
            })
        else:
            data.update({
                "visible": self.visible,
                "x": self.x,
                "y": self.y,
                "size": self.size,
                "direction": self.direction,
                "draggable": self.draggable,
                "rotationStyle": self.rotation_style,
            })
        return data


class Project:
    def __init__(self):
        self.stage = Target("Stage", is_stage=True)
        self.targets = [self.stage]
        self.monitors: list = []
        self.generated: dict[str, bytes] = {}

    def sprite(self, name: str, costumes=None, sounds=None, **kwargs) -> Target:
        kwargs.setdefault("layer_order", len(self.targets))
        target = Target(name, **kwargs)
        target.costumes = list(costumes or [])
        target.sounds = list(sounds or [])
        self.targets.append(target)
        return target

    def global_var(self, name: str, value=0) -> Var:
        variable = Var(name, value)
        self.stage.variables[variable.id] = variable.entry()
        return variable

    def broadcast(self, name: str) -> Broadcast:
        message = Broadcast(name)
        self.stage.broadcasts[message.id] = message.name
        return message

    def monitor(self, variable: Var, mode="default", x=5, y=5, visible=True) -> None:
        self.monitors.append({
            "id": variable.id,
            "mode": mode,
            "opcode": "data_variable",
            "params": {"VARIABLE": variable.name},
            "spriteName": None,
            "value": variable.value,
            "width": 0,
            "height": 0,
            "x": x,
            "y": y,
            "visible": visible,
            "sliderMin": 0,
            "sliderMax": 100,
            "isDiscrete": True,
        })

    def to_dict(self) -> dict:
        return {
            "targets": [target.to_dict() for target in self.targets],
            "monitors": self.monitors,
            "extensions": [],
            "meta": {"semver": "3.0.0", "vm": "0.2.0", "agent": "tools/build_sb3.py"},
        }

    def assets(self) -> dict[str, bytes]:
        wanted: dict[str, bytes] = {}
        for target in self.targets:
            for item in target.costumes + target.sounds:
                md5ext = item["md5ext"]
                if md5ext in self.generated:
                    wanted[md5ext] = self.generated[md5ext]
                else:
                    wanted[md5ext] = fetch_asset(md5ext)
        return wanted


def write_sb3(path: Path, project_json: dict, assets: dict[str, bytes]) -> None:
    """Write the .sb3 deterministically (same input -> byte-identical output)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(project_json, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        def write(name: str, data: bytes) -> None:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            zf.writestr(info, data)

        write("project.json", payload)
        for md5ext in sorted(assets):
            write(md5ext, assets[md5ext])


# ---------------------------------------------------------------------------
# Patching a saved .sb3 (the project the class built live)
# ---------------------------------------------------------------------------


class Sb3File:
    """A saved .sb3 opened for narrow block patching.

    An anchor names what a block *is* (opcode plus variable, procedure or
    touching menu), never an id this script generated, so one recipe also
    applies to a base the teacher saved later. Edits are insert, replace,
    delete and set-literal only; assets, custom blocks and every other id pass
    through untouched, and the same input always writes the same bytes.
    """

    def __init__(self, path: Path):
        self.path = path
        with zipfile.ZipFile(path) as zf:
            self.project = json.loads(zf.read("project.json").decode("utf-8"))
            self.assets = {name: zf.read(name) for name in zf.namelist()
                           if name != "project.json"}
        self._next_id = 0

    # -- reading -------------------------------------------------------------
    def target(self, name: str) -> dict:
        for target in self.project["targets"]:
            if target["name"] == name:
                return target
        raise SystemExit(f"{self.path.name}: ator {name!r} não existe")

    def blocks(self, target_name: str) -> dict:
        return self.target(target_name)["blocks"]

    def block(self, target_name: str, block_id: str) -> dict:
        return self.blocks(target_name)[block_id]

    def find_all(self, target_name: str, opcode: str, **match) -> list[str]:
        """Every block with `opcode` that matches all anchor criteria."""
        blocks = self.blocks(target_name)
        return [block_id for block_id, block in blocks.items()
                if block["opcode"] == opcode and self._matches(target_name, block_id, match)]

    def find(self, target_name: str, opcode: str, **match) -> str:
        """The only block with `opcode` that matches every anchor criterion."""
        found = self.find_all(target_name, opcode, **match)
        if len(found) != 1:
            raise SystemExit(f"{self.path.name}/{target_name}: esperava 1 bloco {opcode} "
                             f"{match}, achei {len(found)}")
        return found[0]

    def find_in(self, target_name: str, owner_id: str, opcode: str, **match) -> str:
        """Like `find`, inside the substacks of the C-block `owner_id`."""
        blocks = self.blocks(target_name)
        nested: set[str] = set()
        for input_name in ("SUBSTACK", "SUBSTACK2"):
            desc = blocks[owner_id]["inputs"].get(input_name)
            if desc is not None:
                nested |= self._nested_set(target_name, desc[1])
        found = [block_id for block_id in blocks
                 if block_id in nested and blocks[block_id]["opcode"] == opcode
                 and self._matches(target_name, block_id, match)]
        if len(found) != 1:
            raise SystemExit(f"{self.path.name}/{target_name}: esperava 1 bloco {opcode} "
                             f"{match} em {owner_id}, achei {len(found)}")
        return found[0]

    # -- editing -------------------------------------------------------------
    def new(self, target_name: str, opcode: str, inputs: dict | None = None,
            fields: dict | None = None, mutation: dict | None = None,
            shadow: bool = False) -> str:
        """Create a detached block (or a menu shadow) for an insert or replace."""
        blocks = self.blocks(target_name)
        while True:
            self._next_id += 1
            block_id = f"p{self._next_id}"
            if block_id not in blocks:
                break
        blocks[block_id] = {
            "opcode": opcode,
            "next": None,
            "parent": None,
            "inputs": inputs or {},
            "fields": fields or {},
            "shadow": shadow,
            "topLevel": False,
        }
        if mutation is not None:
            blocks[block_id]["mutation"] = mutation
        return block_id

    def insert_after(self, target_name: str, anchor_id: str, *block_ids: str) -> str:
        """Splice a chain right after `anchor_id`; returns its last block."""
        blocks = self.blocks(target_name)
        first, last = self._chain(blocks, block_ids)
        anchor = blocks[anchor_id]
        blocks[last]["next"] = anchor["next"]
        blocks[first]["parent"] = anchor_id
        anchor["next"] = first
        return last

    def replace_block(self, target_name: str, anchor_id: str, *block_ids: str) -> str:
        """Put a chain in the anchor's slot and drop the anchor's own subtree."""
        blocks = self.blocks(target_name)
        anchor = blocks[anchor_id]
        parent, nxt = anchor["parent"], anchor["next"]
        keep: set[str] = set()
        for block_id in block_ids:
            keep |= self._input_tree(target_name, block_id)
        drop = self._input_tree(target_name, anchor_id) - keep
        first, last = self._chain(blocks, block_ids)
        blocks[first]["parent"] = parent
        blocks[last]["next"] = nxt
        if parent is not None:
            up = blocks[parent]
            if up["next"] == anchor_id:
                up["next"] = first
            else:
                for desc in up["inputs"].values():
                    for slot, part in enumerate(desc[1:], 1):
                        if part == anchor_id:
                            desc[slot] = first
        elif anchor["topLevel"]:
            blocks[first]["topLevel"] = True
            blocks[first]["x"] = anchor.get("x", 0)
            blocks[first]["y"] = anchor.get("y", 0)
        else:
            raise SystemExit(f"{self.path.name}/{target_name}: {anchor_id} não tem pai "
                             "nem é um script solto")
        if nxt is not None:
            blocks[nxt]["parent"] = last
        for block_id in drop:
            del blocks[block_id]
        return last

    def remove(self, target_name: str, anchor_id: str) -> None:
        """Delete a block and its own subtree, closing the gap in its stack."""
        blocks = self.blocks(target_name)
        block = blocks[anchor_id]
        if block.get("shadow") or self._is_input_shadow(target_name, anchor_id):
            raise SystemExit(f"{self.path.name}/{target_name}: {anchor_id} é um shadow (valor "
                             "ou menu padrão de uma entrada) e não pode ser apagado; "
                             "apague o bloco ativo da entrada")
        parent, nxt = block["parent"], block["next"]
        if parent is not None:
            up = blocks[parent]
            if up["next"] == anchor_id:
                up["next"] = nxt
            else:
                for name, desc in list(up["inputs"].items()):
                    slot = next((i for i in range(1, len(desc)) if desc[i] == anchor_id), None)
                    if slot is None:
                        continue
                    if nxt is not None:
                        desc[slot] = nxt
                    elif len(desc) > 2:
                        desc[:] = [INPUT_SAME_BLOCK_SHADOW, desc[2]]
                    else:
                        del up["inputs"][name]
                    break
        if nxt is not None:
            blocks[nxt]["parent"] = parent
        for block_id in self._input_tree(target_name, anchor_id):
            del blocks[block_id]

    def set_substack(self, target_name: str, owner_id: str, *block_ids: str,
                     input_name: str = "SUBSTACK") -> str:
        """Replace everything inside a C-block's substack; returns the last block."""
        blocks = self.blocks(target_name)
        old = blocks[owner_id]["inputs"].get(input_name)
        keep = self._kept_set(target_name, block_ids)
        drop = self._nested_set(target_name, old[1]) - keep if old is not None else set()
        first, last = self._chain(blocks, block_ids)
        blocks[last]["next"] = None
        blocks[owner_id]["inputs"][input_name] = [INPUT_BLOCK_NO_SHADOW, first]
        blocks[first]["parent"] = owner_id
        for block_id in drop:
            del blocks[block_id]
        return last

    def add_sound(self, target_name: str, item: dict, data: bytes) -> None:
        """Append a sound to a target and carry its bytes into the save."""
        self.target(target_name)["sounds"].append(item)
        self.assets[item["md5ext"]] = data

    def script(self, target_name: str, x: int, y: int, *block_ids: str) -> str:
        """Turn a chain of new blocks into a top-level script on the workspace."""
        blocks = self.blocks(target_name)
        first, _ = self._chain(blocks, block_ids)
        blocks[first]["topLevel"] = True
        blocks[first]["x"] = x
        blocks[first]["y"] = y
        return first

    def set_literal(self, target_name: str, anchor_id: str, input_name: str, value) -> None:
        """Rewrite the number/text literal of an input, keeping its primitive."""
        desc = self.block(target_name, anchor_id)["inputs"][input_name]
        if not isinstance(desc[1], list):
            raise SystemExit(f"{anchor_id}.{input_name}: a entrada não é um literal")
        desc[1][1] = str(value)

    # -- writing -------------------------------------------------------------
    def save(self, path: Path) -> None:
        """Write the patched project, deterministically, next to its assets."""
        for target in self.project["targets"]:
            self._relink(target)
        write_sb3(path, self.project, self.assets)

    # -- graph helpers -------------------------------------------------------
    def _matches(self, target_name: str, block_id: str, match: dict) -> bool:
        block = self.block(target_name, block_id)
        for key, value in match.items():
            if key == "var":
                if self._writes_var(block):
                    if block["fields"].get("VARIABLE", [None])[0] != value:
                        return False
                elif not self._uses_var(target_name, block_id, value):
                    return False
            elif key == "proccode":
                if self._proccode(target_name, block_id) != value:
                    return False
            elif key == "touches":
                if not self._has_menu(target_name, block_id, "sensing_touchingobjectmenu",
                                      "TOUCHINGOBJECTMENU", value):
                    return False
            elif key == "flip":
                if self._is_sign_flip(target_name, block_id) != value:
                    return False
            elif key == "inside":
                if block_id not in self._nested_set(target_name, value):
                    return False
            else:
                raise SystemExit(f"âncora desconhecida: {key!r}")
        return True

    def _proccode(self, target_name: str, block_id: str) -> str | None:
        block = self.block(target_name, block_id)
        if block["opcode"] == "procedures_definition":
            prototype = block["inputs"]["custom_block"][1]
            return self.block(target_name, prototype)["mutation"]["proccode"]
        return block.get("mutation", {}).get("proccode")

    @staticmethod
    def _writes_var(block: dict) -> bool:
        return block["opcode"] in ("data_setvariableto", "data_changevariableby")

    def _is_sign_flip(self, target_name: str, block_id: str) -> bool:
        """`mude [v] para ((0) - (v))`, the assignment that turns a sign over."""
        blocks = self.blocks(target_name)
        block = blocks[block_id]
        name = block["fields"].get("VARIABLE", [None])[0]
        if not self._writes_var(block) or name is None:
            return False
        value = block["inputs"].get("VALUE")
        if value is None or not isinstance(value[1], str) or value[1] not in blocks:
            return False
        subtract = blocks[value[1]]
        if subtract["opcode"] != "operator_subtract":
            return False
        zero, read = subtract["inputs"].get("NUM1"), subtract["inputs"].get("NUM2")
        if zero is None or read is None or not isinstance(zero[1], list):
            return False
        if zero[1][0] not in (MATH_NUMBER, TEXT) or zero[1][1] != "0":
            return False
        if isinstance(read[1], str):
            return blocks.get(read[1], {}).get("fields", {}).get("VARIABLE", [None])[0] == name
        return read[1][0] == VARIABLE_PRIMITIVE and read[1][1] == name

    def _uses_var(self, target_name: str, block_id: str, name: str) -> bool:
        """The block or something inside it reads or writes variable `name`."""
        blocks = self.blocks(target_name)
        for bid in self._input_tree(target_name, block_id):
            if blocks[bid]["fields"].get("VARIABLE", [None])[0] == name:
                return True
            for desc in blocks[bid]["inputs"].values():
                for part in desc[1:]:
                    if isinstance(part, list) and len(part) > 1 and part[0] == VARIABLE_PRIMITIVE \
                            and part[1] == name:
                        return True
        return False

    def _has_menu(self, target_name: str, block_id: str, opcode: str, field: str,
                  value) -> bool:
        blocks = self.blocks(target_name)
        return any(blocks[bid]["opcode"] == opcode
                   and blocks[bid]["fields"].get(field, [None])[0] == value
                   for bid in self._input_tree(target_name, block_id))

    def _input_tree(self, target_name: str, block_id: str) -> set[str]:
        """The block and everything its inputs hold (reporters and shadows)."""
        blocks = self.blocks(target_name)
        seen: set[str] = set()
        stack = [block_id]
        while stack:
            bid = stack.pop()
            if bid in seen or bid not in blocks:
                continue
            seen.add(bid)
            for desc in blocks[bid]["inputs"].values():
                stack.extend(part for part in desc[1:] if isinstance(part, str))
        return seen

    def _is_input_shadow(self, target_name: str, block_id: str) -> bool:
        """The block is the shadow slot (index 2) of some input."""
        return any(len(desc) > 2 and desc[2] == block_id
                   for block in self.blocks(target_name).values()
                   for desc in block["inputs"].values())

    def _kept_set(self, target_name: str, block_ids: tuple[str, ...]) -> set[str]:
        """Blocks a reused chain carries: itself, its inputs and the chains
        inside those inputs. The reused head's own `next` stays out — that is
        the old stack's continuation, not part of the new chain."""
        blocks = self.blocks(target_name)
        seen: set[str] = set()
        stack = [(block_id, False) for block_id in block_ids]
        while stack:
            bid, follow_next = stack.pop()
            if bid in seen or bid not in blocks:
                continue
            seen.add(bid)
            if follow_next and blocks[bid]["next"] is not None:
                stack.append((blocks[bid]["next"], True))
            for desc in blocks[bid]["inputs"].values():
                stack.extend((part, True) for part in desc[1:] if isinstance(part, str))
        return seen

    def _nested_set(self, target_name: str, head_id: str) -> set[str]:
        """A block, its inputs, and everything below it in its stack."""
        blocks = self.blocks(target_name)
        seen: set[str] = set()
        stack = [head_id]
        while stack:
            bid = stack.pop()
            if bid in seen or bid not in blocks:
                continue
            seen.add(bid)
            if blocks[bid]["next"] is not None:
                stack.append(blocks[bid]["next"])
            for desc in blocks[bid]["inputs"].values():
                stack.extend(part for part in desc[1:] if isinstance(part, str))
        return seen

    @staticmethod
    def _chain(blocks: dict, block_ids: tuple[str, ...]) -> tuple[str, str]:
        for prev, nxt in zip(block_ids, block_ids[1:]):
            blocks[prev]["next"] = nxt
            blocks[nxt]["parent"] = prev
        return block_ids[0], block_ids[-1]

    @staticmethod
    def _relink(target: dict) -> None:
        """Recompute every parent link and drop blocks nothing points at."""
        blocks = target["blocks"]
        parents: dict[str, str | None] = {}

        def walk(block_id: str, parent: str | None) -> None:
            if block_id in parents or block_id not in blocks:
                return
            parents[block_id] = parent
            block = blocks[block_id]
            if block["next"] is not None:
                walk(block["next"], block_id)
            for desc in block["inputs"].values():
                for part in desc[1:]:
                    if isinstance(part, str):
                        walk(part, block_id)

        for block_id, block in list(blocks.items()):
            if block["topLevel"]:
                walk(block_id, None)
        for block_id in list(blocks):
            if block_id not in parents:
                del blocks[block_id]
        for block_id, parent in parents.items():
            blocks[block_id]["parent"] = parent


# ---------------------------------------------------------------------------
# Project 1 - Lesson 1: mouse training
# ---------------------------------------------------------------------------


def build_treino_do_mouse() -> Project:
    project = Project()
    stage = project.stage
    stage.costumes = [BACKDROP_BLUE_SKY]

    cliques = project.global_var("cliques", 0)
    duplos = project.global_var("duplos", 0)
    frutas = project.global_var("frutas", 0)
    ultimo = project.global_var("tempo do último clique", -10)
    esperando = project.global_var("esperando", 0)

    fase1 = project.broadcast("fase 1")
    fase2 = project.broadcast("fase 2")
    fase3 = project.broadcast("fase 3")
    final = project.broadcast("final")
    dica = project.broadcast("dica")

    # Score board on the stage so the kids can follow their progress.
    project.monitor(cliques, x=5, y=5)
    project.monitor(duplos, x=5, y=40)
    project.monitor(frutas, x=5, y=75)

    # ---------------------------------------------------------------- Gato
    gato = project.sprite("Gato", costumes=[CAT_A, CAT_B], sounds=[MEOW],
                          x=0, y=-140, size=60, layer_order=1)

    gato.script(40, 40,
        gato.hat("event_whenflagclicked"),
        gato.set_var(cliques, gato.text(0)),
        gato.set_var(duplos, gato.text(0)),
        gato.set_var(frutas, gato.text(0)),
        gato.set_var(ultimo, gato.text(-10)),
        gato.set_var(esperando, gato.text(0)),
        gato.go_to(0, -140),
        gato.say_for("Fase 1: clique na bexiga 10 vezes!", 3),
        gato.send(fase1),
    )

    gato.script(40, 400,
        gato.start_on_broadcast(fase2),
        gato.say_for("Muito bem! Fase 2: dê dois cliques bem rápidos no presente!", 3),
    )

    gato.script(40, 520,
        gato.start_on_broadcast(dica),
        gato.say_for("Clique duas vezes bem rápido!", 1),
    )

    gato.script(40, 640,
        gato.start_on_broadcast(fase3),
        gato.say_for("Agora arraste as frutas para a tigela!", 3),
    )

    nome = gato.op("operator_join",
                   STRING1=gato.plug_text(gato.op("operator_join",
                                                  STRING1=gato.text("Olá, "),
                                                  STRING2=gato.plug_text(gato.op("sensing_answer")))),
                   STRING2=gato.text("!"))
    gato.script(40, 760,
        gato.start_on_broadcast(final),
        gato.say_for("Parabéns! Você sabe usar o mouse!", 2),
        gato.play_sound_until_done("Meow"),
        gato.repeat(6, gato.add("looks_nextcostume"), gato.wait(0.2)),
        gato.ask("Qual é o seu nome?"),
        gato.say(gato.plug_text(nome)),
    )

    # --------------------------------------------------------------- Balao
    balao = project.sprite("Balão", costumes=BALLOON, sounds=[POP],
                           x=0, y=0, size=50, visible=False, layer_order=7)

    balao.script(40, 40,
        balao.hat("event_whenflagclicked"),
        balao.add("looks_hide"),
    )

    balao.script(240, 40,
        balao.start_on_broadcast(fase1),
        balao.add("looks_setsizeto", {"SIZE": i_num(50)}),
        balao.switch_costume("balloon1-a"),
        balao.add("looks_gotofrontback", fields={"FRONT_BACK": ["front", None]}),
        balao.go_to(balao.op("operator_random", FROM=i_num(-180), TO=i_num(180)),
                    balao.op("operator_random", FROM=i_num(-110), TO=i_num(110))),
        balao.add("looks_show"),
    )

    balao.script(240, 360,
        balao.hat("event_whenthisspriteclicked"),
        balao.play_sound("Pop"),
        balao.change_var(cliques, i_num(1)),
        balao.if_else(
            balao.op("operator_gt", OPERAND1=balao.plug_text(balao.rep_var(cliques)),
                     OPERAND2=i_text(9)),
            [balao.add("looks_hide"), balao.send(fase2)],
            [balao.go_to(balao.op("operator_random", FROM=i_num(-180), TO=i_num(180)),
                         balao.op("operator_random", FROM=i_num(-110), TO=i_num(110)))],
        ),
    )

    # ------------------------------------------------------------- Presente
    presente = project.sprite("Presente", costumes=GIFT, sounds=[POP_LOWER],
                             x=0, y=-20, size=70, visible=False, layer_order=6)

    presente.script(40, 40,
        presente.hat("event_whenflagclicked"),
        presente.add("looks_hide"),
    )

    presente.script(240, 40,
        presente.start_on_broadcast(fase2),
        presente.add("looks_setsizeto", {"SIZE": i_num(70)}),
        presente.switch_costume("gift-a"),
        presente.add("motion_pointindirection", {"DIRECTION": i_angle(90)}),
        presente.set_var(esperando, presente.text(0)),
        presente.set_var(ultimo, presente.text(-10)),
        presente.go_to(0, -20),
        presente.add("looks_show"),
    )

    # Watches the wait: if 0.5 s go by without a 2nd click, the cat gives the hint.
    demora = presente.op("operator_gt",
                         OPERAND1=presente.plug_text(
                             presente.op("operator_subtract",
                                         NUM1=presente.plug_num(presente.op("sensing_timer")),
                                         NUM2=presente.plug_num(presente.rep_var(ultimo))),
                         ),
                         OPERAND2=i_text(0.5))
    esperando_eh_um = presente.op("operator_equals",
                                 OPERAND1=presente.plug_text(presente.rep_var(esperando)),
                                 OPERAND2=i_text(1))
    presente.script(240, 360,
        presente.start_on_broadcast(fase2),
        presente.forever(
            presente.if_(presente.op("operator_and",
                                     OPERAND1=i_block(esperando_eh_um),
                                     OPERAND2=i_block(demora)),
                         presente.set_var(esperando, presente.text(0)),
                         presente.send(dica)),
        ),
    )

    presente.script(480, 40,
        presente.hat("event_whenthisspriteclicked"),
        presente.if_else(
            presente.op("operator_lt",
                        OPERAND1=presente.plug_num(presente.op(
                            "operator_subtract",
                            NUM1=presente.plug_num(presente.op("sensing_timer")),
                            NUM2=presente.plug_num(presente.rep_var(ultimo)))),
                        OPERAND2=i_text(0.5)),
            [
                presente.set_var(esperando, presente.text(0)),
                presente.set_var(ultimo, presente.text(-10)),
                presente.change_var(duplos, i_num(1)),
                presente.play_sound("pop"),
                presente.repeat(8,
                                presente.add("motion_turnright", {"DEGREES": i_num(45)}),
                                presente.add("looks_changesizeby", {"CHANGE": i_num(4)}),
                                presente.wait(0.04)),
                presente.add("motion_pointindirection", {"DIRECTION": i_angle(90)}),
                presente.add("looks_setsizeto", {"SIZE": i_num(70)}),
                presente.if_(presente.op("operator_gt",
                                         OPERAND1=presente.plug_text(presente.rep_var(duplos)),
                                         OPERAND2=i_text(4)),
                             presente.add("looks_hide"),
                             presente.send(fase3)),
            ],
            [
                presente.set_var(ultimo, presente.plug_text(presente.op("sensing_timer"))),
                presente.set_var(esperando, presente.text(1)),
            ],
        ),
    )

    # ---------------------------------------------------------------- Frutas
    fruta_defs = [("Maçã", APPLE, -120), ("Bananas", BANANAS, -60), ("Laranja", ORANGE, 0)]
    for index, (name, costume_list, pos_y) in enumerate(fruta_defs):
        fruta = project.sprite(name, costumes=costume_list, x=-170, y=pos_y,
                               visible=False, layer_order=3 + index)

        fruta.script(40, 40,
            fruta.hat("event_whenflagclicked"),
            fruta.add("looks_hide"),
            fruta.set_drag_mode(False),
        )

        fruta.script(240, 40,
            fruta.start_on_broadcast(fase3),
            fruta.go_to(-170, pos_y),
            fruta.add("looks_show"),
            fruta.set_drag_mode(True),
            fruta.forever(
                fruta.if_(fruta.op("operator_and",
                                   OPERAND1=i_block(fruta.touching("Tigela")),
                                   OPERAND2=i_block(fruta.op("operator_not", OPERAND=i_block(
                                       fruta.add("sensing_mousedown"))))),
                          fruta.add("looks_hide"),
                          fruta.change_var(frutas, i_num(1)),
                          fruta.stop_this_script()),
            ),
        )

    # --------------------------------------------------------------- Tigela
    tigela = project.sprite("Tigela", costumes=BOWL, sounds=[POP_LOWER],
                            x=160, y=-60, size=200, visible=False, layer_order=2)

    tigela.script(40, 40,
        tigela.hat("event_whenflagclicked"),
        tigela.add("looks_hide"),
    )

    tigela.script(240, 40,
        tigela.start_on_broadcast(fase3),
        tigela.add("looks_setsizeto", {"SIZE": i_num(200)}),
        tigela.go_to(160, -60),
        tigela.add("looks_show"),
        tigela.wait_until(tigela.op("operator_gt",
                                    OPERAND1=tigela.plug_text(tigela.rep_var(frutas)),
                                    OPERAND2=i_text(2))),
        tigela.send(final),
    )

    return project


# ---------------------------------------------------------------------------
# Project 2 - Lesson 2: coordinate hunt
# ---------------------------------------------------------------------------


def build_caca_as_coordenadas() -> Project:
    project = Project()
    stage = project.stage
    stage.costumes = [BACKDROP_XY_GRID]

    mouse_x = project.global_var("x do mouse", 0)
    mouse_y = project.global_var("y do mouse", 0)
    pontos = project.global_var("pontos", 0)
    estrela_x = project.global_var("x da estrela", 0)
    estrela_y = project.global_var("y da estrela", 0)
    resposta_x = project.global_var("resposta x", 0)

    nova_estrela = project.broadcast("nova estrela")

    project.monitor(mouse_x, mode="large", x=5, y=5)
    project.monitor(mouse_y, mode="large", x=5, y=110)
    project.monitor(pontos, x=5, y=215)

    # Mouse readout: x and y on screen all the time, in large digits.
    stage.script(40, 40,
        stage.hat("event_whenflagclicked"),
        stage.forever(
            stage.set_var(mouse_x, stage.plug_text(stage.op("sensing_mousex"))),
            stage.set_var(mouse_y, stage.plug_text(stage.op("sensing_mousey"))),
        ),
    )

    # ------------------------------------------------------------------ Gato
    gato = project.sprite("Gato", costumes=[CAT_A, CAT_B], sounds=[MEOW],
                          x=0, y=0, size=70, layer_order=1)

    # Comparisons: the kid's answer against the star position.
    acertou_x = gato.op("operator_equals",
                        OPERAND1=gato.plug_text(gato.rep_var(resposta_x)),
                        OPERAND2=gato.plug_text(gato.rep_var(estrela_x)))
    acertou_y = gato.op("operator_equals",
                        OPERAND1=gato.plug_text(gato.op("sensing_answer")),
                        OPERAND2=gato.plug_text(gato.rep_var(estrela_y)))
    certo = gato.op("operator_and",
                    OPERAND1=i_block(acertou_x),
                    OPERAND2=i_block(acertou_y))

    par_x = gato.op("operator_join",
                    STRING1=gato.text("("),
                    STRING2=gato.plug_text(gato.rep_var(estrela_x)))
    par_y = gato.op("operator_join",
                    STRING1=gato.plug_text(gato.rep_var(estrela_y)),
                    STRING2=gato.text(")"))
    ponto = gato.op("operator_join",
                    STRING1=gato.plug_text(par_x),
                    STRING2=gato.plug_text(gato.op("operator_join",
                                                   STRING1=gato.text(", "),
                                                   STRING2=gato.plug_text(par_y))))
    errou = gato.op("operator_join",
                    STRING1=gato.text("Quase! A estrela estava em "),
                    STRING2=gato.plug_text(ponto))

    fim = gato.op("operator_join",
                  STRING1=gato.text("Fim de jogo! Você fez "),
                  STRING2=gato.plug_text(gato.op(
                      "operator_join",
                      STRING1=gato.plug_text(gato.rep_var(pontos)),
                      STRING2=gato.text(" pontos!"))))

    gato.script(40, 40,
        gato.hat("event_whenflagclicked"),
        gato.go_to(0, 0),
        gato.set_var(pontos, gato.text(0)),
        gato.say_for("Eu estou no ponto (0, 0)! Ajude-me a pegar as estrelas.", 3),
        gato.repeat(10,
            gato.send_and_wait(nova_estrela),
            gato.ask("Qual é o x da estrela?"),
            gato.set_var(resposta_x, gato.plug_text(gato.op("sensing_answer"))),
            gato.ask("E o y?"),
            gato.if_else(
                certo,
                [
                    gato.change_var(pontos, i_num(1)),
                    gato.play_sound("Meow"),
                    gato.say_for("Isso! Você acertou!", 1),
                ],
                [gato.say_for(gato.plug_text(errou), 2)],
            ),
            gato.glide_to_xy(
                1,
                gato.plug_num(gato.rep_var(estrela_x)),
                gato.plug_num(gato.rep_var(estrela_y)),
            ),
        ),
        gato.say_for(gato.plug_text(fim), 5),
    )

    # --------------------------------------------------------------- Estrela
    estrela = project.sprite("Estrela", costumes=STAR, x=0, y=0, size=100,
                             visible=False, rotation_style="don't rotate", layer_order=2)

    estrela.script(40, 40,
        estrela.hat("event_whenflagclicked"),
        estrela.add("looks_hide"),
    )

    multiplicador_x = estrela.op("operator_multiply",
                                 NUM1=i_num(60),
                                 NUM2=estrela.plug_num(estrela.op("operator_random",
                                                                  FROM=i_num(-3), TO=i_num(3))))
    multiplicador_y = estrela.op("operator_multiply",
                                 NUM1=i_num(60),
                                 NUM2=estrela.plug_num(estrela.op("operator_random",
                                                                  FROM=i_num(-2), TO=i_num(2))))

    estrela.script(240, 40,
        estrela.start_on_broadcast(nova_estrela),
        estrela.set_var(estrela_x, estrela.plug_text(multiplicador_x)),
        estrela.set_var(estrela_y, estrela.plug_text(multiplicador_y)),
        estrela.go_to(estrela.plug_num(estrela.rep_var(estrela_x)),
                      estrela.plug_num(estrela.rep_var(estrela_y))),
        estrela.add("looks_setsizeto", {"SIZE": i_num(100)}),
        estrela.add("looks_show"),
    )

    return project


# ---------------------------------------------------------------------------
# Project 3 - Lesson 3: catch the fruit (starter and finished game)
# ---------------------------------------------------------------------------

# The widest fruit costume (watermelon-a) is 80.27 px wide at size 100, so the
# sprite is set to 99 to keep every costume within 80 stage px.
FRUTA_SIZE = 99


def _pega_frutas_scene():
    """Stage, bowl and fruit shared by the starter and the finished game."""
    project = Project()
    project.stage.costumes = [BACKDROP_BLUE_SKY]

    tigela = project.sprite("Tigela", costumes=BOWL, sounds=[POP], x=0, y=-150, size=150)
    fruta = project.sprite("Fruta", costumes=APPLE + BANANAS + ORANGE + WATERMELON + STRAWBERRY,
                           sounds=[POP], x=0, y=120, size=FRUTA_SIZE)
    return project, tigela, fruta


def build_pega_frutas() -> Project:
    return _pega_frutas_scene()[0]


def _respawn(fruta) -> list:
    """`go to a random x at the top and pick a random costume`."""
    return [
        fruta.go_to(fruta.op("operator_random", FROM=i_num(-200), TO=i_num(200)), 180),
        fruta.add("looks_switchcostumeto",
                  {"COSTUME": i_plug_menu(
                      fruta.op("operator_random", FROM=i_num(1), TO=i_num(5)),
                      fruta.menu("looks_costume", "COSTUME", "apple")[1])}),
    ]


def build_pega_frutas_pronto() -> Project:
    project, tigela, fruta = _pega_frutas_scene()

    pontos = project.global_var("pontos", 0)
    project.monitor(pontos, x=5, y=5)

    # The bowl follows the mouse along the bottom of the stage.
    tigela.script(40, 40,
        tigela.hat("event_whenflagclicked"),
        tigela.forever(
            tigela.go_to(tigela.plug_num(tigela.op("sensing_mousex")), -150),
        ),
    )

    # The fruit falls, respawns at the top and scores when it touches the bowl.
    fruta.script(40, 40,
        fruta.hat("event_whenflagclicked"),
        fruta.set_var(pontos, fruta.text(0)),
        *_respawn(fruta),
        fruta.forever(
            fruta.add("motion_changeyby", {"DY": i_num(-5)}),
            fruta.if_(fruta.op("operator_lt",
                               OPERAND1=fruta.plug_num(fruta.op("motion_yposition")),
                               OPERAND2=i_num(-170)),
                      *_respawn(fruta)),
            fruta.if_(fruta.touching("Tigela"),
                      fruta.change_var(pontos, i_num(1)),
                      *_respawn(fruta)),
        ),
    )
    return project


# ---------------------------------------------------------------------------
# Projects 4 and 5 - Pong (court, paddles and ball drawn by the script)
# ---------------------------------------------------------------------------

COURT_W = 480
COURT_H = 360
NET_W = 4
DASH = 12
GAP = 12


def svg_court() -> str:
    """480x360 black court with a dashed white net at x = 0."""
    dashes = "".join(
        f'<rect x="{COURT_W // 2 - NET_W // 2}" y="{y}" width="{NET_W}" height="{DASH}"/>'
        for y in range(0, COURT_H, DASH + GAP)
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{COURT_W}" height="{COURT_H}" '
        f'viewBox="0 0 {COURT_W} {COURT_H}">'
        f'<rect width="{COURT_W}" height="{COURT_H}" fill="#000000"/>'
        f'<g fill="#ffffff">{dashes}</g></svg>'
    )


def svg_rect(width: int, height: int) -> str:
    """A solid white rectangle, used for the paddles and the ball."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
        f'<rect width="{width}" height="{height}" fill="#ffffff"/></svg>'
    )


def _pong_scene():
    project = Project()
    project.stage.costumes = [local_costume(project, "Quadra", svg_court(), COURT_W // 2, COURT_H // 2)]
    raquete = local_costume(project, "Raquete", svg_rect(10, 60), 5, 30)
    bola_costume = local_costume(project, "Bola", svg_rect(12, 12), 6, 6)

    raquete1 = project.sprite("Raquete1", costumes=[raquete], x=-200, y=0)
    raquete2 = project.sprite("Raquete2", costumes=[raquete], x=200, y=0)
    bola = project.sprite("Bola", costumes=[bola_costume], sounds=[POP], x=0, y=0)
    return project, raquete1, raquete2, bola


def build_pong() -> Project:
    return _pong_scene()[0]


# The file the class opens on 03/11: the teacher's save after meeting 10,
# committed as saved. The demo is that file plus the meeting's two steps.
PONG_DEMO_BASE = "projetos/Aula5-PongInicio.sb3"

WIN_TEXT = "Vitória do jogador "


def _already_patched(sb3: Sb3File, body_id: str) -> bool:
    """`diga (junte <texto> com (jogador)) por (2) segundos` + `pare [todos]`."""
    blocks = sb3.blocks("Bola")
    body = blocks[body_id]
    if body["opcode"] != "looks_sayforsecs":
        return False
    secs = body["inputs"].get("SECS")
    if secs is None or not isinstance(secs[1], list) or secs[1][1] != "2":
        return False
    message = body["inputs"].get("MESSAGE")
    if message is None or not isinstance(message[1], str) or message[1] not in blocks:
        return False
    join = blocks[message[1]]
    if join["opcode"] != "operator_join":
        return False
    second = join["inputs"].get("STRING2")
    if second is None or not isinstance(second[1], str) or second[1] not in blocks:
        return False
    arg = blocks[second[1]]
    if arg["opcode"] != "argument_reporter_string_number" \
            or arg["fields"].get("VALUE", [None])[0] != "jogador":
        return False
    stop = body["next"]
    if stop is None or stop not in blocks:
        return False
    return blocks[stop]["opcode"] == "control_stop" \
        and blocks[stop]["fields"].get("STOP_OPTION", [None])[0] == "all"


def patch_win_message(sb3: Sb3File) -> None:
    """`fim_jogo (jogador)` says "Vitória do jogador N" for 2 s, then stops all."""
    definition = sb3.find("Bola", "procedures_definition", proccode="fim_jogo %s")
    body = sb3.block("Bola", definition)["next"]
    if body is None:
        raise SystemExit("fim_jogo: o bloco personalizado está vazio")
    if _already_patched(sb3, body):
        return
    message = sb3.block("Bola", body)["inputs"].get("MESSAGE")
    if message is None or not isinstance(message[1], str) \
            or message[1] not in sb3.blocks("Bola"):
        raise SystemExit(f"{sb3.path.name}/Bola: fim_jogo esperava `diga (jogador)`, mas o "
                         "MESSAGE do `diga` não aponta para um bloco (é um literal)")
    if sb3.block("Bola", message[1])["opcode"] == "operator_join":
        raise SystemExit(f"{sb3.path.name}/Bola: fim_jogo já tem um `junte` dentro do `diga`; "
                         "corrija o arquivo base antes de gerar o demo")
    join = sb3.new("Bola", "operator_join",
                   {"STRING1": i_text(WIN_TEXT),
                    "STRING2": i_plug(message[1], prim_text(""))})
    say = sb3.new("Bola", "looks_sayforsecs",
                  {"MESSAGE": i_plug(join, prim_text("")), "SECS": i_num(2)})
    stop = sb3.new("Bola", "control_stop", fields={"STOP_OPTION": ["all", None]},
                   mutation={"tagName": "mutation", "children": [], "hasnext": "false"})
    sb3.replace_block("Bola", body, say, stop)


def patch_speed_up(sb3: Sb3File) -> None:
    """`+1` to vx after the Raquete1 bounce, `-1` after the Raquete2 one."""
    for paddle, delta in (("Raquete1", 1), ("Raquete2", -1)):
        hit = sb3.find("Bola", "control_if", touches=paddle)
        flip = sb3.find_in("Bola", hit, "data_setvariableto", var="vx", flip=True)
        follow = sb3.block("Bola", flip)["next"]
        if follow is not None and sb3.block("Bola", follow)["opcode"] == "data_changevariableby" \
                and sb3.block("Bola", follow)["fields"]["VARIABLE"][0] == "vx":
            continue
        sb3.insert_after("Bola", flip, sb3.new(
            "Bola", "data_changevariableby", {"VALUE": i_num(delta)},
            {"VARIABLE": sb3.block("Bola", flip)["fields"]["VARIABLE"]}))


def build_pong_pronto(sb3: Sb3File) -> None:
    """The finished demo: the base file plus the two steps of the meeting."""
    patch_win_message(sb3)
    patch_speed_up(sb3)


# ---------------------------------------------------------------------------
# Projects 6 and 7 - Music: the melody of Aula 6 and the beat of Aula 7
# ---------------------------------------------------------------------------

SONS = ROOT / "src" / "sons"
BEAT_SECONDS = 0.5          # 120 BPM: one beat, and one costume step

BALLERINA = [
    costume("ballerina-a", "5197d3778baf55da6b81b3ada1e10021.svg",
            31.00008984350052, 49),
    costume("ballerina-b", "4ccb1752a43f48aafe490c9c08e58c27.svg",
            29.496239121982484, 23.769351839794098),
    costume("ballerina-c", "fc02bf591dd3d91eeeb50c7424d08274.svg",
            59.502591601941845, 59.184989331170854),
    costume("ballerina-d", "5aae21aee33c3f1ae943af5ea11254bf.svg",
            36.40099014292747, 77.95160112758442),
]
DRUM_KIT = [
    costume("drum-kit", "baf6344b6f55b074786a383c1097697d.svg", 58, 78),
    costume("drum-kit-b", "3f4fb4836338c55f883607c403b2b25e.svg", 58, 78),
]


def _musica_scene() -> Project:
    project = Project()
    project.stage.costumes = [BACKDROP_BLUE_SKY]
    return project


def build_melodias() -> Project:
    """Starter: the stage and one dancer, for the kid's own MP3."""
    project = _musica_scene()
    project.sprite("Bailarina", costumes=BALLERINA)
    return project


def build_batidas() -> Project:
    """Starter: the same dancer plus a drum kit, for kids who missed Aula 6."""
    project = _musica_scene()
    project.sprite("Bailarina", costumes=BALLERINA, x=-100)
    project.sprite("Bateria", costumes=DRUM_KIT, x=100)
    return project


def add_song(sb3: Sb3File, target_name: str, name: str, path: Path) -> None:
    item, data = sound_file(name, path)
    sb3.add_sound(target_name, item, data)


def beat_scripts(sb3: Sb3File, target_name: str, sound_name: str, x: int) -> None:
    """`quando ⚑` -> `toque o som (...) até o fim`, and `quando ⚑` -> `sempre`.

    The `sempre` needs its own hat: a loop left loose on the workspace never
    runs, and hanging it after the sound would freeze the costume for 16 s.
    """
    menu = sb3.new(target_name, "sound_sounds_menu",
                   fields={"SOUND_MENU": [sound_name, None]}, shadow=True)
    hat = sb3.new(target_name, "event_whenflagclicked")
    play = sb3.new(target_name, "sound_playuntildone",
                   {"SOUND_MENU": [INPUT_SAME_BLOCK_SHADOW, menu]})
    sb3.script(target_name, x, 40, hat, play)

    beat_hat = sb3.new(target_name, "event_whenflagclicked")
    forever = sb3.new(target_name, "control_forever")
    sb3.set_substack(target_name, forever,
                     sb3.new(target_name, "looks_nextcostume"),
                     sb3.new(target_name, "control_wait",
                             {"DURATION": i_positive(BEAT_SECONDS)}))
    sb3.script(target_name, x, 140, beat_hat, forever)


def build_melodias_pronto(sb3: Sb3File) -> None:
    add_song(sb3, "Bailarina", "Melodia", SONS / "melodia.mp3")
    beat_scripts(sb3, "Bailarina", "Melodia", 60)


def build_batidas_pronto(sb3: Sb3File) -> None:
    add_song(sb3, "Bailarina", "Melodia", SONS / "melodia.mp3")
    add_song(sb3, "Bateria", "Batida", SONS / "batida.mp3")
    beat_scripts(sb3, "Bailarina", "Melodia", 60)
    beat_scripts(sb3, "Bateria", "Batida", 320)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

HAT_OPCODES = {
    "event_whenflagclicked", "event_whenkeypressed", "event_whenthisspriteclicked",
    "event_whenstageclicked", "event_whenbackdropswitchesto", "event_whenbroadcastreceived",
}

PROCEDURE_OPCODES = {
    "procedures_definition", "procedures_call", "procedures_prototype",
    "argument_reporter_string_number", "argument_reporter_boolean",
}

# Scratch 3 core opcodes (harvested from the scratch-vm block sources:
# src/blocks/scratch3_*.js -> getPrimitives(), plus the scratch-blocks
# menus/hats and the compressed primitives).
CORE_OPCODES = {
    "colour_picker", "control_all_at_once", "control_clear_counter",
    "control_create_clone_of", "control_create_clone_of_menu", "control_delete_this_clone",
    "control_for_each", "control_forever", "control_get_counter", "control_if",
    "control_if_else", "control_incr_counter", "control_repeat", "control_repeat_until",
    "control_stop", "control_wait", "control_wait_until", "control_while",
    "data_addtolist", "data_changevariableby", "data_deletealloflist", "data_deleteoflist",
    "data_hidelist", "data_hidevariable", "data_insertatlist", "data_itemnumoflist",
    "data_itemoflist", "data_lengthoflist", "data_listcontainsitem", "data_listcontents",
    "data_replaceitemoflist", "data_setvariableto", "data_showlist", "data_showvariable",
    "data_variable", "event_broadcast", "event_broadcast_menu", "event_broadcastandwait",
    "event_whengreaterthan", "event_whentouchingobject", "looks_backdropnumbername",
    "looks_backdrops", "looks_changeeffectby", "looks_changesizeby", "looks_changestretchby",
    "looks_cleargraphiceffects", "looks_costume", "looks_costumenumbername",
    "looks_goforwardbackwardlayers", "looks_gotofrontback", "looks_hide",
    "looks_hideallsprites", "looks_nextbackdrop", "looks_nextcostume", "looks_say",
    "looks_sayforsecs", "looks_seteffectto", "looks_setsizeto", "looks_setstretchto",
    "looks_show", "looks_size", "looks_switchbackdropto", "looks_switchbackdroptoandwait",
    "looks_switchcostumeto", "looks_think", "looks_thinkforsecs", "math_angle",
    "math_integer", "math_number", "math_positive_number", "math_whole_number",
    "motion_align_scene", "motion_changexby", "motion_changeyby", "motion_direction",
    "motion_glidesecstoxy", "motion_glideto", "motion_glideto_menu", "motion_goto",
    "motion_goto_menu", "motion_gotoxy", "motion_ifonedgebounce", "motion_movesteps",
    "motion_pointindirection", "motion_pointtowards", "motion_pointtowards_menu",
    "motion_scroll_right", "motion_scroll_up", "motion_setrotationstyle", "motion_setx",
    "motion_sety", "motion_turnleft", "motion_turnright", "motion_xposition",
    "motion_xscroll", "motion_yposition", "motion_yscroll", "operator_add", "operator_and",
    "operator_contains", "operator_divide", "operator_equals", "operator_gt",
    "operator_join", "operator_length", "operator_letter_of", "operator_lt",
    "operator_mathop", "operator_mod", "operator_multiply", "operator_not", "operator_or",
    "operator_random", "operator_round", "operator_subtract", "sensing_answer",
    "sensing_askandwait", "sensing_coloristouchingcolor", "sensing_current",
    "sensing_dayssince2000", "sensing_distanceto", "sensing_distancetomenu",
    "sensing_keyoptions", "sensing_keypressed", "sensing_loud", "sensing_loudness",
    "sensing_mousedown", "sensing_mousex", "sensing_mousey", "sensing_of",
    "sensing_of_object_menu", "sensing_resettimer", "sensing_setdragmode",
    "sensing_timer", "sensing_touchingcolor", "sensing_touchingobject",
    "sensing_touchingobjectmenu", "sensing_userid", "sensing_username",
    "sound_beats_menu", "sound_changeeffectby", "sound_changevolumeby",
    "sound_cleareffects", "sound_effects_menu", "sound_play", "sound_playuntildone",
    "sound_seteffectto", "sound_setvolumeto", "sound_sounds_menu", "sound_stopallsounds",
    "sound_volume", "text",
} | HAT_OPCODES | PROCEDURE_OPCODES


def check_sb3(path: Path) -> list[str]:
    """Check the .sb3 structure. Returns the list of problems found."""
    problems: list[str] = []
    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
        if "project.json" not in names:
            return [f"{path.name}: project.json is missing"]
        project = json.loads(zf.read("project.json").decode("utf-8"))
        members = {name: zf.read(name) for name in names if name != "project.json"}

    semver = project.get("meta", {}).get("semver")
    if semver != "3.0.0":
        problems.append(f"meta.semver = {semver!r} (esperado '3.0.0')")
    targets = project.get("targets", [])
    if not targets or not targets[0].get("isStage"):
        problems.append("the first target should be the stage")
    stage = targets[0]
    names_seen = set()
    for target in targets:
        if target["name"] in names_seen:
            problems.append(f"duplicated target: {target['name']}")
        names_seen.add(target["name"])

    # assets
    used_assets = set()
    for target in targets:
        for item in target.get("costumes", []) + target.get("sounds", []):
            # TurboWarp may leave md5ext out; assetId + dataFormat still name the file
            md5ext = item.get("md5ext", f"{item['assetId']}.{item['dataFormat']}")
            used_assets.add(md5ext)
            if md5ext != f"{item['assetId']}.{item['dataFormat']}":
                problems.append(f"{target['name']}: assetId/dataFormat do not match md5ext {md5ext}")
    for md5ext in sorted(used_assets):
        if md5ext not in members:
            problems.append(f"asset {md5ext} is referenced but missing from the zip")
            continue
        digest = hashlib.md5(members[md5ext]).hexdigest()
        if digest != md5ext.partition(".")[0]:
            problems.append(f"asset {md5ext}: content md5 is {digest}")
    extra = set(members) - used_assets
    if extra:
        problems.append(f"unused assets in the zip: {sorted(extra)}")

    # Scratch takes a sound's rate and sampleCount from the decoded audio; a
    # missing or zero pair leaves the sound with no length in the editor
    for target in targets:
        for item in target.get("sounds", []):
            rate, count = item.get("rate"), item.get("sampleCount")
            if not isinstance(rate, int) or rate <= 0 \
                    or not isinstance(count, int) or count <= 0:
                problems.append(
                    f"{target['name']}: som {item['name']} sem rate/sampleCount validos "
                    f"({rate!r}/{count!r})")

    # blocks
    sprite_names = {t["name"] for t in targets if not t["isStage"]}
    stage_costumes = {c["name"] for c in stage.get("costumes", [])}
    menu_targets = {
        "sound_sounds_menu": ("SOUND_MENU", lambda v, t: v in {s["name"] for s in t.get("sounds", [])}, "sound"),
        "looks_costume": ("COSTUME", lambda v, t: v in {c["name"] for c in t.get("costumes", [])}, "costume"),
        "looks_backdrops": ("BACKDROP", lambda v, t: v in stage_costumes, "backdrop"),
        "sensing_touchingobjectmenu": (
            "TOUCHINGOBJECTMENU",
            lambda v, t: v in sprite_names or v in ("_mouse_", "_edge_"), "sprite"),
    }
    for target in targets:
        blocks = target["blocks"]
        variables = target.get("variables", {})
        for block_id, block in blocks.items():
            opcode = block["opcode"]
            if opcode not in CORE_OPCODES:
                problems.append(f"{target['name']}/{block_id}: unknown opcode {opcode}")
            parent = block["parent"]
            if parent is not None:
                if parent not in blocks:
                    problems.append(f"{target['name']}/{block_id}: parent {parent} does not exist")
                else:
                    up = blocks[parent]
                    # a plugged reporter is referenced by desc[1], a hidden menu
                    # shadow by desc[2] (INPUT_DIFF_BLOCK_SHADOW)
                    linked = up["next"] == block_id or any(
                        isinstance(desc, list) and any(part == block_id for part in desc[1:])
                        for desc in up["inputs"].values())
                    if not linked:
                        problems.append(f"{target['name']}/{block_id}: parent {parent} does not point back")
            nxt = block["next"]
            if nxt is not None and nxt not in blocks:
                problems.append(f"{target['name']}/{block_id}: next {nxt} does not exist")
            if block["topLevel"]:
                if not isinstance(block.get("x"), (int, float)) or not isinstance(block.get("y"), (int, float)):
                    problems.append(f"{target['name']}/{block_id}: top level script without x/y")
                if parent is not None:
                    problems.append(f"{target['name']}/{block_id}: topLevel block with a parent")
            for input_name, desc in block["inputs"].items():
                if not isinstance(desc, list) or not desc:
                    problems.append(f"{target['name']}/{block_id}.{input_name}: invalid descriptor")
                    continue
                for part in desc[1:]:
                    if isinstance(part, str) and part not in blocks:
                        problems.append(f"{target['name']}/{block_id}.{input_name}: block {part} does not exist")
                if desc[0] not in (1, 2, 3):
                    problems.append(f"{target['name']}/{block_id}.{input_name}: invalid kind {desc[0]}")
                # the third slot of INPUT_DIFF_BLOCK_SHADOW names the hidden menu
                # shadow: it must be a real shadow, owned by the block that holds
                # the input and not left loose on the workspace
                if len(desc) >= 3 and isinstance(desc[2], str):
                    shadow_id = desc[2]
                    shadow = blocks.get(shadow_id)
                    if shadow is None:
                        problems.append(
                            f"{target['name']}/{block_id}.{input_name}: shadow block {shadow_id} does not exist")
                    else:
                        if not shadow.get("shadow"):
                            problems.append(
                                f"{target['name']}/{block_id}.{input_name}: block {shadow_id} is not a shadow")
                        # input blocks are serialized without a parent link here, so
                        # an absent parent is accepted; a wrong one is a problem
                        shadow_parent = shadow.get("parent")
                        if shadow_parent is not None and shadow_parent != block_id:
                            problems.append(
                                f"{target['name']}/{block_id}.{input_name}: shadow {shadow_id} parent is "
                                f"{shadow_parent}, not {block_id}")
                        if shadow.get("topLevel"):
                            problems.append(
                                f"{target['name']}/{block_id}.{input_name}: shadow {shadow_id} is topLevel")
            fields = block["fields"]
            for field_name, field_value in fields.items():
                if field_name == "VARIABLE":
                    if field_value[1] not in variables and field_value[1] not in stage["variables"]:
                        problems.append(f"{target['name']}/{block_id}: variable {field_value[0]} not declared on the target")
                elif field_name == "BROADCAST_OPTION":
                    if stage["broadcasts"].get(field_value[1]) != field_value[0]:
                        problems.append(f"{target['name']}/{block_id}: broadcast {field_value[0]} not declared")
            for input_name, desc in block["inputs"].items():
                for part in desc[1:]:
                    # a number/text shadow whose value looks like a block id (or like
                    # a Python repr of an input descriptor) means the reporter was
                    # stringified instead of plugged in -- always a build bug
                    if isinstance(part, list) and part and part[0] in (MATH_NUMBER, TEXT):
                        if re.search(r"^[bs]\d+$|\['[bs]\d+'", str(part[1])):
                            problems.append(
                                f"{target['name']}/{block_id}.{input_name}: shadow value {part[1]!r} "
                                f"looks like a block id, not a literal")
                    if isinstance(part, list) and part and part[0] == VARIABLE_PRIMITIVE and len(part) > 2:
                        if part[2] not in stage.get("variables", {}) and part[2] not in variables:
                            problems.append(f"{target['name']}/{block_id}.{input_name}: variable {part[1]} not declared")
                    if isinstance(part, list) and part and part[0] == BROADCAST_PRIMITIVE and len(part) > 2:
                        if stage["broadcasts"].get(part[2]) != part[1]:
                            problems.append(f"{target['name']}/{block_id}.{input_name}: broadcast {part[1]} not declared")
            # menu inputs must name something that really exists
            for input_name, desc in block["inputs"].items():
                if not isinstance(desc, list) or len(desc) < 2 or not isinstance(desc[1], str):
                    continue
                menu = blocks.get(desc[1])
                if not menu or not menu.get("shadow"):
                    continue
                spec = menu_targets.get(menu["opcode"])
                if spec is None:
                    continue
                field_name, exists, what = spec
                value = menu["fields"].get(field_name, [None])[0]
                if not exists(value, target):
                    problems.append(
                        f"{target['name']}/{block_id}.{input_name}: {what} {value!r} does not exist")

    # monitors
    for monitor in project.get("monitors", []):
        if monitor["opcode"] != "data_variable":
            problems.append(f"monitor with opcode {monitor['opcode']}")
            continue
        owner = stage if monitor["spriteName"] is None else next(
            (t for t in targets if t["name"] == monitor["spriteName"]), None)
        if owner is None:
            problems.append(f"monitor {monitor['params']}: target does not exist")
            continue
        entry = owner["variables"].get(monitor["id"])
        if entry is None:
            problems.append(f"monitor {monitor['params']}: id is not the id of a target variable")
        elif entry[0] != monitor["params"]["VARIABLE"]:
            problems.append(f"monitor {monitor['params']}: name does not match variable {entry[0]}")
    return problems


def opcodes_used(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as zf:
        project = json.loads(zf.read("project.json").decode("utf-8"))
    used = set()
    for target in project["targets"]:
        for block in target["blocks"].values():
            used.add(block["opcode"])
    return sorted(used)


# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="validate the .sb3 files on disk instead of building them")
    args = parser.parse_args()

    builders = {
        "projetos/Aula1-TreinoDoMouse.sb3": build_treino_do_mouse,
        "projetos/Aula2-CacaAsCoordenadas.sb3": build_caca_as_coordenadas,
        "projetos/Aula3-PegaFrutas.sb3": build_pega_frutas,
        "demos/Aula3-PegaFrutas-pronto.sb3": build_pega_frutas_pronto,
        "projetos/Aula4-Pong.sb3": build_pong,
        "projetos/Aula6-Melodias.sb3": build_melodias,
        "projetos/Aula7-Batidas.sb3": build_batidas,
    }
    # Patched from a saved file instead of drawn from scratch: (base, recipe).
    patched = {
        "demos/Aula5-Pong-pronto.sb3": (PONG_DEMO_BASE, build_pong_pronto),
        "demos/Aula6-Melodias-pronto.sb3": ("projetos/Aula6-Melodias.sb3",
                                            build_melodias_pronto),
        "demos/Aula7-Batidas-pronto.sb3": ("projetos/Aula7-Batidas.sb3",
                                           build_batidas_pronto),
    }
    # The class's own saves: committed as the teacher saved them, never rewritten.
    verbatim = ["projetos/Aula5-PongInicio.sb3"]

    if not args.check:
        for filename, builder in builders.items():
            project = builder()
            path = ROOT / filename
            write_sb3(path, project.to_dict(), project.assets())
            print(f"wrote {path.relative_to(ROOT)}")
        for filename, (base, recipe) in patched.items():
            sb3 = Sb3File(ROOT / base)
            recipe(sb3)
            path = ROOT / filename
            sb3.save(path)
            print(f"wrote {path.relative_to(ROOT)} (a partir de {base})")

    failed = False
    for filename in [*builders, *patched, *verbatim]:
        path = ROOT / filename
        problems = check_sb3(path)
        used = opcodes_used(path)
        print(f"\n{path.relative_to(ROOT)}: {len(used)} opcodes, {len(problems)} problem(s)")
        print("  opcodes:", ", ".join(used))
        for problem in problems:
            failed = True
            print("  -", problem)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
