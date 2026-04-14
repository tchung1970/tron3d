import pygame
import sys
import os
import math
from collections import deque

# --- INIT ---
pygame.init()
pygame.mixer.init()

info = pygame.display.Info()
DISPLAY_W, DISPLAY_H = info.current_w, info.current_h

# Pick a cell size so the grid is roughly 60 cells wide, keeping a playable density.
CELL = max(16, min(48, DISPLAY_W // 60))
GRID_W = DISPLAY_W // CELL
GRID_H = DISPLAY_H // CELL
WINDOW_W = GRID_W * CELL
WINDOW_H = GRID_H * CELL

screen = pygame.display.set_mode((WINDOW_W, WINDOW_H), pygame.FULLSCREEN)
pygame.display.set_caption('Tron Light Cycles')
pygame.mouse.set_visible(False)
clock = pygame.time.Clock()

# --- CONFIG ---
FPS = 60
MOVE_MS = 80           # ms per grid step (lower = faster)
WIN_SCORE = 5

# Neon palette
YELLOW = (255, 214, 64)
YELLOW_GLOW = (255, 170, 40)
PURPLE = (190, 80, 255)
PURPLE_GLOW = (150, 60, 230)
BG_TOP = (6, 8, 20)
BG_BOTTOM = (14, 20, 44)
GRID_COLOR = (28, 34, 62)
GRID_ACCENT = (48, 60, 100)
WHITE = (240, 245, 255)
DIM = (150, 160, 190)
ACCENT = (100, 220, 255)

UP, DOWN, LEFT, RIGHT = (0, -1), (0, 1), (-1, 0), (1, 0)
OPPOSITE = {UP: DOWN, DOWN: UP, LEFT: RIGHT, RIGHT: LEFT}


# --- ASSETS ---
def load_sprite(path, fallback_color):
    if os.path.exists(path):
        img = pygame.image.load(path).convert_alpha()
        return pygame.transform.smoothscale(img, (CELL, CELL))
    surf = pygame.Surface((CELL, CELL), pygame.SRCALPHA)
    pygame.draw.rect(surf, fallback_color, (0, 0, CELL, CELL), border_radius=CELL // 4)
    return surf


player_img = load_sprite('yellow.png', YELLOW)
ai_img = load_sprite('purple.png', PURPLE)

cycle_sound = None
if os.path.exists('sound.wav'):
    cycle_sound = pygame.mixer.Sound('sound.wav')
    cycle_sound.set_volume(0.35)
SOUND_CHANNEL = pygame.mixer.Channel(0) if cycle_sound else None


def pick_font(candidates, size, bold=False):
    name = pygame.font.match_font(','.join(candidates), bold=bold)
    if name:
        return pygame.font.Font(name, size)
    return pygame.font.SysFont(None, size, bold=bold)


UI_FONT_NAMES = ['Helvetica Neue', 'SF Pro Display', 'Avenir Next', 'Segoe UI', 'Arial']
font_hero = pick_font(UI_FONT_NAMES, max(64, CELL * 3), bold=True)
font_big = pick_font(UI_FONT_NAMES, max(44, CELL * 2), bold=True)
font_mid = pick_font(UI_FONT_NAMES, max(26, CELL + 6))
font_small = pick_font(UI_FONT_NAMES, max(18, CELL // 2 + 6))


# --- PRE-RENDERED VISUALS ---
def make_background():
    surf = pygame.Surface((WINDOW_W, WINDOW_H))
    for y in range(WINDOW_H):
        t = y / max(1, WINDOW_H - 1)
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)
        pygame.draw.line(surf, (r, g, b), (0, y), (WINDOW_W, y))
    # grid lines
    for x in range(0, WINDOW_W, CELL):
        pygame.draw.line(surf, GRID_COLOR, (x, 0), (x, WINDOW_H))
    for y in range(0, WINDOW_H, CELL):
        pygame.draw.line(surf, GRID_COLOR, (0, y), (WINDOW_W, y))
    # brighter accent every 5 cells
    for x in range(0, WINDOW_W, CELL * 5):
        pygame.draw.line(surf, GRID_ACCENT, (x, 0), (x, WINDOW_H))
    for y in range(0, WINDOW_H, CELL * 5):
        pygame.draw.line(surf, GRID_ACCENT, (0, y), (WINDOW_W, y))
    # vignette
    vignette = pygame.Surface((WINDOW_W, WINDOW_H), pygame.SRCALPHA)
    max_r = int(math.hypot(WINDOW_W / 2, WINDOW_H / 2))
    steps = 32
    ring_w = max(2, max_r // steps // 2)
    for i in range(steps, 0, -1):
        alpha = int(110 * (i / steps) ** 2)
        r = int(max_r * (i / steps))
        pygame.draw.circle(vignette, (0, 0, 0, alpha),
                           (WINDOW_W // 2, WINDOW_H // 2), r, width=ring_w)
    surf.blit(vignette, (0, 0))
    return surf


def make_trail_block(color):
    s = pygame.Surface((CELL, CELL), pygame.SRCALPHA)
    dark = tuple(c // 3 for c in color)
    bright = tuple(min(255, c + 60) for c in color)
    pygame.draw.rect(s, dark, (0, 0, CELL, CELL), border_radius=CELL // 6)
    inset = max(2, CELL // 6)
    pygame.draw.rect(s, color, (inset, inset, CELL - 2 * inset, CELL - 2 * inset),
                     border_radius=max(2, CELL // 8))
    inner = max(3, CELL // 3)
    pygame.draw.rect(s, bright,
                     (CELL // 2 - inner // 2, CELL // 2 - inner // 2, inner, inner),
                     border_radius=max(1, inner // 3))
    return s


def make_glow(color, diameter):
    s = pygame.Surface((diameter, diameter), pygame.SRCALPHA)
    cx = cy = diameter // 2
    layers = 8
    for i in range(layers, 0, -1):
        t = i / layers
        alpha = int(110 * (1 - t) ** 1.8) + 6
        r = int(cx * t)
        pygame.draw.circle(s, (*color, alpha), (cx, cy), r)
    return s


BACKGROUND = make_background()
TRAIL_BLOCK = {YELLOW: make_trail_block(YELLOW), PURPLE: make_trail_block(PURPLE)}
HEAD_GLOW = {
    YELLOW: make_glow(YELLOW_GLOW, CELL * 5),
    PURPLE: make_glow(PURPLE_GLOW, CELL * 5),
}


# --- GAME STATE ---
def new_cycle(x, y, direction, color, img):
    return {
        'head': (x, y),
        'trail': {(x, y)},
        'dir': direction,
        'next_dir': direction,
        'color': color,
        'img': img,
    }


def reset_round():
    global player, ai, tick_accum, phase, round_winner, paused, crash_flash
    player = new_cycle(GRID_W * 3 // 4, GRID_H // 2, LEFT, YELLOW, player_img)
    ai = new_cycle(GRID_W // 4, GRID_H // 2, RIGHT, PURPLE, ai_img)
    tick_accum = 0
    phase = 'ready'          # 'ready' | 'playing' | 'round_over' | 'match_over'
    round_winner = None
    paused = False
    crash_flash = 0.0


def reset_match():
    global score
    score = {'player': 0, 'ai': 0}
    reset_round()


# --- LOGIC ---
def in_bounds(cell):
    x, y = cell
    return 0 <= x < GRID_W and 0 <= y < GRID_H


def step(cell, d):
    return (cell[0] + d[0], cell[1] + d[1])


def flood_fill_size(start, blocked, limit=600):
    if not in_bounds(start) or start in blocked:
        return 0
    seen = {start}
    q = deque([start])
    while q and len(seen) < limit:
        c = q.popleft()
        for d in (UP, DOWN, LEFT, RIGHT):
            n = step(c, d)
            if n in seen or not in_bounds(n) or n in blocked:
                continue
            seen.add(n)
            q.append(n)
    return len(seen)


def ai_choose():
    cur = ai['dir']
    candidates = [cur]
    if cur in (LEFT, RIGHT):
        candidates += [UP, DOWN]
    else:
        candidates += [LEFT, RIGHT]

    blocked = player['trail'] | ai['trail']
    best_dir = cur
    best_score = -1
    for d in candidates:
        n = step(ai['head'], d)
        if not in_bounds(n) or n in blocked:
            continue
        score_val = flood_fill_size(n, blocked)
        if d == cur:
            score_val += 1  # prefer straight paths when tied
        if score_val > best_score:
            best_score = score_val
            best_dir = d
    ai['next_dir'] = best_dir


def set_next_dir(cycle, d):
    if d != OPPOSITE[cycle['dir']]:
        cycle['next_dir'] = d


def tick_game():
    ai_choose()
    player['dir'] = player['next_dir']
    ai['dir'] = ai['next_dir']

    p_new = step(player['head'], player['dir'])
    a_new = step(ai['head'], ai['dir'])

    blocked = player['trail'] | ai['trail']
    p_crash = (not in_bounds(p_new)) or p_new in blocked
    a_crash = (not in_bounds(a_new)) or a_new in blocked
    if p_new == a_new:
        p_crash = a_crash = True

    if not p_crash:
        player['head'] = p_new
        player['trail'].add(p_new)
    if not a_crash:
        ai['head'] = a_new
        ai['trail'].add(a_new)

    return p_crash, a_crash


# --- SOUND ---
def sound_start():
    if cycle_sound and not SOUND_CHANNEL.get_busy():
        SOUND_CHANNEL.play(cycle_sound, loops=-1)

def sound_stop():
    if cycle_sound:
        SOUND_CHANNEL.stop()


# --- RENDERING ---
def draw_trails():
    for cx, cy in player['trail']:
        screen.blit(TRAIL_BLOCK[YELLOW], (cx * CELL, cy * CELL))
    for cx, cy in ai['trail']:
        screen.blit(TRAIL_BLOCK[PURPLE], (cx * CELL, cy * CELL))


def draw_head(cycle, pulse):
    glow = HEAD_GLOW[cycle['color']]
    gx = cycle['head'][0] * CELL + CELL // 2 - glow.get_width() // 2
    gy = cycle['head'][1] * CELL + CELL // 2 - glow.get_height() // 2
    scale = 1.0 + 0.08 * pulse
    if abs(scale - 1.0) > 0.01:
        w = int(glow.get_width() * scale)
        scaled = pygame.transform.smoothscale(glow, (w, w))
        gx = cycle['head'][0] * CELL + CELL // 2 - w // 2
        gy = cycle['head'][1] * CELL + CELL // 2 - w // 2
        screen.blit(scaled, (gx, gy), special_flags=pygame.BLEND_ADD)
    else:
        screen.blit(glow, (gx, gy), special_flags=pygame.BLEND_ADD)
    screen.blit(cycle['img'], (cycle['head'][0] * CELL, cycle['head'][1] * CELL))


def draw_panel(rect, alpha=180, border=ACCENT, radius=None):
    if radius is None:
        radius = CELL // 2
    panel = pygame.Surface(rect.size, pygame.SRCALPHA)
    pygame.draw.rect(panel, (10, 14, 28, alpha), panel.get_rect(), border_radius=radius)
    pygame.draw.rect(panel, (*border, 180), panel.get_rect(), width=2, border_radius=radius)
    screen.blit(panel, rect.topleft)


def draw_hud():
    pad_x = CELL
    pad_y = CELL // 2
    text = f"HUMAN  {score['player']}   :   {score['ai']}  AI"
    surf = font_mid.render(text, True, WHITE)
    rect = surf.get_rect(midtop=(WINDOW_W // 2, pad_y))
    panel = rect.inflate(pad_x * 2, pad_y)
    draw_panel(panel)
    screen.blit(surf, rect)

    tip = font_small.render("ARROWS move   \u00b7   P pause   \u00b7   Q/Esc quit", True, DIM)
    tip_rect = tip.get_rect(midbottom=(WINDOW_W // 2, WINDOW_H - pad_y))
    screen.blit(tip, tip_rect)


def draw_glow_text(font, text, color, center, glow_color=None, glow_radius=8):
    if glow_color is None:
        glow_color = color
    base = font.render(text, True, color)
    glow = font.render(text, True, glow_color)
    glow.set_alpha(90)
    rect = base.get_rect(center=center)
    for dx, dy in ((-glow_radius, 0), (glow_radius, 0), (0, -glow_radius), (0, glow_radius),
                   (-glow_radius // 2, -glow_radius // 2), (glow_radius // 2, glow_radius // 2),
                   (-glow_radius // 2, glow_radius // 2), (glow_radius // 2, -glow_radius // 2)):
        screen.blit(glow, rect.move(dx, dy), special_flags=pygame.BLEND_ADD)
    screen.blit(base, rect)


def draw_centerpiece(title, sub=None, subsub=None, title_color=ACCENT, pulse=1.0):
    w = min(WINDOW_W - CELL * 4, CELL * 36)
    h = CELL * 8
    rect = pygame.Rect(0, 0, w, h)
    rect.center = (WINDOW_W // 2, WINDOW_H // 2)
    draw_panel(rect, alpha=200, radius=CELL)
    ttl_color = tuple(min(255, int(c * pulse)) for c in title_color)
    draw_glow_text(font_big, title, WHITE, (WINDOW_W // 2, WINDOW_H // 2 - h // 4),
                   glow_color=ttl_color, glow_radius=max(4, CELL // 4))
    if sub:
        s = font_mid.render(sub, True, WHITE)
        screen.blit(s, s.get_rect(center=(WINDOW_W // 2, WINDOW_H // 2 + h // 8)))
    if subsub:
        s = font_small.render(subsub, True, DIM)
        screen.blit(s, s.get_rect(center=(WINDOW_W // 2, WINDOW_H // 2 + h // 3)))


def draw_legend(y_center):
    label_x = WINDOW_W // 2 - CELL * 5
    screen.blit(player_img, (label_x, y_center - CELL))
    screen.blit(font_small.render("YELLOW  \u2014  YOU", True, WHITE),
                (label_x + CELL + 10, y_center - CELL + 2))
    screen.blit(ai_img, (label_x, y_center + 6))
    screen.blit(font_small.render("PURPLE  \u2014  AI", True, WHITE),
                (label_x + CELL + 10, y_center + 8))


def draw_crash_flash(intensity):
    if intensity <= 0:
        return
    overlay = pygame.Surface((WINDOW_W, WINDOW_H), pygame.SRCALPHA)
    overlay.fill((255, 255, 255, int(220 * intensity)))
    screen.blit(overlay, (0, 0))


# --- MAIN ---
reset_match()
time_s = 0.0

while True:
    dt = clock.tick(FPS)
    time_s += dt / 1000.0

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
        if event.type == pygame.KEYDOWN:
            if event.key in (pygame.K_q, pygame.K_ESCAPE):
                pygame.quit()
                sys.exit()

            if phase == 'ready' and event.key in (pygame.K_RETURN, pygame.K_SPACE):
                phase = 'playing'
            elif phase == 'round_over' and event.key in (pygame.K_RETURN, pygame.K_SPACE):
                reset_round()
                phase = 'playing'
            elif phase == 'match_over' and event.key in (pygame.K_RETURN, pygame.K_SPACE):
                reset_match()
                phase = 'playing'
            elif phase == 'playing':
                if event.key == pygame.K_p:
                    paused = not paused
                    if paused:
                        sound_stop()
                elif not paused:
                    if event.key == pygame.K_LEFT:
                        set_next_dir(player, LEFT)
                    elif event.key == pygame.K_RIGHT:
                        set_next_dir(player, RIGHT)
                    elif event.key == pygame.K_UP:
                        set_next_dir(player, UP)
                    elif event.key == pygame.K_DOWN:
                        set_next_dir(player, DOWN)

    if phase == 'playing' and not paused:
        sound_start()
        tick_accum += dt
        while tick_accum >= MOVE_MS:
            tick_accum -= MOVE_MS
            p_crash, a_crash = tick_game()
            if p_crash or a_crash:
                if p_crash and a_crash:
                    round_winner = 'tie'
                elif p_crash:
                    round_winner = 'ai'
                    score['ai'] += 1
                else:
                    round_winner = 'player'
                    score['player'] += 1
                sound_stop()
                crash_flash = 1.0
                phase = 'match_over' if (score['player'] >= WIN_SCORE or score['ai'] >= WIN_SCORE) else 'round_over'
                break
    else:
        sound_stop()

    # decay crash flash
    if crash_flash > 0:
        crash_flash = max(0.0, crash_flash - dt / 500.0)

    # --- render ---
    screen.blit(BACKGROUND, (0, 0))
    draw_trails()
    pulse = 0.5 + 0.5 * math.sin(time_s * 6.0)
    if phase != 'ready':
        draw_head(player, pulse)
        draw_head(ai, pulse)
    draw_hud()

    if phase == 'ready':
        title_pulse = 0.85 + 0.15 * math.sin(time_s * 3.0)
        draw_centerpiece("TRON  CYCLES", f"First to {WIN_SCORE} rounds wins",
                         "Press Enter or Space to start",
                         title_color=ACCENT, pulse=title_pulse)
        draw_legend(WINDOW_H // 2 + CELL * 5)
    elif phase == 'round_over':
        msg = {'tie': "TIE ROUND", 'ai': "AI TAKES IT", 'player': "ROUND TO YOU"}[round_winner]
        col = {'tie': WHITE, 'ai': PURPLE_GLOW, 'player': YELLOW_GLOW}[round_winner]
        draw_centerpiece(msg, f"{score['player']}   \u2013   {score['ai']}",
                         "Press Enter for next round", title_color=col)
    elif phase == 'match_over':
        won = score['player'] > score['ai']
        champ = "VICTORY" if won else "DEFEAT"
        col = YELLOW_GLOW if won else PURPLE_GLOW
        draw_centerpiece(champ,
                         f"Final  {score['player']}  \u2013  {score['ai']}",
                         "Press Enter to play again", title_color=col)
    elif paused:
        draw_centerpiece("PAUSED", None, "Press P to resume", title_color=ACCENT)

    draw_crash_flash(crash_flash)
    pygame.display.flip()
