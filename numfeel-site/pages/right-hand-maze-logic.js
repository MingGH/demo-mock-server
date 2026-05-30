const DIRECTIONS = ['N', 'E', 'S', 'W'];
const DELTAS = {
  N: { r: -1, c: 0 },
  E: { r: 0, c: 1 },
  S: { r: 1, c: 0 },
  W: { r: 0, c: -1 }
};

const RIGHT_TURN = { N: 'E', E: 'S', S: 'W', W: 'N' };
const LEFT_TURN = { N: 'W', W: 'S', S: 'E', E: 'N' };
const BACK_TURN = { N: 'S', S: 'N', E: 'W', W: 'E' };

const PRESET_MAZES = {
  simple: {
    id: 'simple',
    name: '连通无环迷宫（右手法可行）',
    rows: [
      '###########',
      '#S#.....#E#',
      '#.#.###.#.#',
      '#.#...#.#.#',
      '#.###.#.#.#',
      '#.....#...#',
      '###########'
    ]
  },
  complex: {
    id: 'complex',
    name: '进阶蛇形迷宫（路径更长）',
    rows: [
      '#################',
      '#S......#......E#',
      '######.#.#.######',
      '#......#.#......#',
      '#.######.######.#',
      '#.#....#.#....#.#',
      '#.#.##.#.#.##.#.#',
      '#...##...#..#.#.#',
      '###.######.##.#.#',
      '#...#....#....#.#',
      '#.###.##.######.#',
      '#.....##........#',
      '#################'
    ]
  },
  trap: {
    id: 'trap',
    name: '带环孤岛迷宫（右手法失灵）',
    rows: [
      '#############',
      '#E.....######',
      '######.######',
      '###.......###',
      '###.#####.###',
      '###.#####.###',
      '###S#####.###',
      '###.#####.###',
      '###.#####.###',
      '###.......###',
      '#############'
    ]
  }
};

function parseMaze(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('rows 不能为空');
  }

  const width = rows[0].length;
  let start = null;
  let exit = null;
  const grid = rows.map((line, r) => {
    if (line.length !== width) {
      throw new Error('迷宫每一行长度必须相同');
    }
    return line.split('').map((ch, c) => {
      if (ch === 'S') {
        start = { r, c };
        return '.';
      }
      if (ch === 'E') {
        exit = { r, c };
        return '.';
      }
      if (ch !== '#' && ch !== '.') {
        throw new Error(`非法字符: ${ch}`);
      }
      return ch;
    });
  });

  if (!start || !exit) {
    throw new Error('迷宫必须包含 S 和 E');
  }

  return { grid, start, exit, height: grid.length, width };
}

function inBounds(maze, r, c) {
  return r >= 0 && r < maze.height && c >= 0 && c < maze.width;
}

function isWalkable(maze, r, c) {
  return inBounds(maze, r, c) && maze.grid[r][c] === '.';
}

function nextMoveOrder(dir) {
  return [RIGHT_TURN[dir], dir, LEFT_TURN[dir], BACK_TURN[dir]];
}

function simulateRightHand(rows, options = {}) {
  const maze = Array.isArray(rows) ? parseMaze(rows) : rows;
  const initialDir = options.initialDir || 'N';
  const maxSteps = options.maxSteps || 3000;
  if (!DIRECTIONS.includes(initialDir)) {
    throw new Error('initialDir 必须是 N/E/S/W');
  }

  let position = { ...maze.start };
  let dir = initialDir;
  const path = [{ ...position }];
  const visitedStates = new Set([`${position.r},${position.c},${dir}`]);

  for (let step = 1; step <= maxSteps; step++) {
    const tryOrder = nextMoveOrder(dir);
    let moved = false;

    for (const candidate of tryOrder) {
      const delta = DELTAS[candidate];
      const nr = position.r + delta.r;
      const nc = position.c + delta.c;
      if (!isWalkable(maze, nr, nc)) {
        continue;
      }
      position = { r: nr, c: nc };
      dir = candidate;
      path.push({ ...position });
      moved = true;
      break;
    }

    if (!moved) {
      return { success: false, reason: 'STUCK', steps: step - 1, path, finalDir: dir };
    }

    if (position.r === maze.exit.r && position.c === maze.exit.c) {
      return { success: true, reason: 'EXIT', steps: step, path, finalDir: dir };
    }

    const key = `${position.r},${position.c},${dir}`;
    if (visitedStates.has(key)) {
      return { success: false, reason: 'LOOP', steps: step, path, finalDir: dir };
    }
    visitedStates.add(key);
  }

  return { success: false, reason: 'MAX_STEPS', steps: maxSteps, path, finalDir: dir };
}

function shortestPath(rows) {
  const maze = Array.isArray(rows) ? parseMaze(rows) : rows;
  const queue = [{ ...maze.start, dist: 0, prev: null }];
  const visited = new Set([`${maze.start.r},${maze.start.c}`]);
  const parent = new Map();

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.r === maze.exit.r && current.c === maze.exit.c) {
      const path = [];
      let key = `${current.r},${current.c}`;
      while (key) {
        const [r, c] = key.split(',').map(Number);
        path.push({ r, c });
        key = parent.get(key) || null;
      }
      path.reverse();
      return { reachable: true, distance: current.dist, path };
    }

    for (const dir of DIRECTIONS) {
      const delta = DELTAS[dir];
      const nr = current.r + delta.r;
      const nc = current.c + delta.c;
      if (!isWalkable(maze, nr, nc)) {
        continue;
      }
      const key = `${nr},${nc}`;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      parent.set(key, `${current.r},${current.c}`);
      queue.push({ r: nr, c: nc, dist: current.dist + 1, prev: `${current.r},${current.c}` });
    }
  }

  return { reachable: false, distance: -1, path: [] };
}

function runBatchExperiment(trials = 200, options = {}) {
  const maxSteps = options.maxSteps || 2000;
  const pool = options.mazeIds || Object.keys(PRESET_MAZES);
  const directions = options.directions || DIRECTIONS;
  const summary = {
    total: trials,
    rightHandSuccess: 0,
    rightHandFailLoop: 0,
    rightHandFailStuck: 0,
    rightHandFailMaxSteps: 0,
    reachableByShortestPath: 0,
    avgRightHandStepsOnSuccess: 0,
    avgShortestDistance: 0
  };

  let successStepsSum = 0;
  let shortestDistanceSum = 0;
  let shortestCount = 0;

  for (let i = 0; i < trials; i++) {
    const mazeId = pool[Math.floor(Math.random() * pool.length)];
    const maze = PRESET_MAZES[mazeId];
    const dir = directions[Math.floor(Math.random() * directions.length)];
    const right = simulateRightHand(maze.rows, { initialDir: dir, maxSteps });
    const shortest = shortestPath(maze.rows);

    if (shortest.reachable) {
      summary.reachableByShortestPath += 1;
      shortestDistanceSum += shortest.distance;
      shortestCount += 1;
    }

    if (right.success) {
      summary.rightHandSuccess += 1;
      successStepsSum += right.steps;
    } else if (right.reason === 'LOOP') {
      summary.rightHandFailLoop += 1;
    } else if (right.reason === 'STUCK') {
      summary.rightHandFailStuck += 1;
    } else {
      summary.rightHandFailMaxSteps += 1;
    }
  }

  summary.avgRightHandStepsOnSuccess = summary.rightHandSuccess === 0 ? 0 : Math.round((successStepsSum / summary.rightHandSuccess) * 100) / 100;
  summary.avgShortestDistance = shortestCount === 0 ? 0 : Math.round((shortestDistanceSum / shortestCount) * 100) / 100;
  return summary;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DIRECTIONS,
    PRESET_MAZES,
    parseMaze,
    simulateRightHand,
    shortestPath,
    runBatchExperiment
  };
}
