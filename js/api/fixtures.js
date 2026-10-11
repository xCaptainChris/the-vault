// Demo/test data. 'test' is deterministic (PLAN §7b); 'sample' is the richer demo.
// Each builder takes `now` (ms) so dates are relative to load time.

export const CATEGORIES = [
  { name: 'Chores',   emoji: '🧹', color: '#4cd964', dir: 'in',   active: true },
  { name: 'Gift',     emoji: '🎁', color: '#ffcc4d', dir: 'in',   active: true },
  { name: 'Spending', emoji: '🛒', color: '#ff6b5e', dir: 'out',  active: true },
  { name: 'Digital',  emoji: '🎮', color: '#c084fc', dir: 'out',  active: true },
  { name: 'Tithing',  emoji: '⛪', color: '#7ea6ff', dir: 'out',  active: true },
  { name: 'Savings',  emoji: '🏦', color: '#34d1b2', dir: 'out',  active: true },
  { name: 'Other',    emoji: '➕', color: '#8a8a96', dir: 'both', active: true },
];

const PARENTS = [
  { id: 'p_dad', name: 'Dad', pin: '1234' },
  { id: 'p_mom', name: 'Mom', pin: '5678' },
];

function kids(goals) {
  return [
    { id: 'k_logan', name: 'Logan', color: '#4cd964', emoji: '🦖', goalName: goals.logan[0], goalCents: goals.logan[1], archived: false },
    { id: 'k_lizzy', name: 'Lizzy', color: '#00d2ff', emoji: '🦄', goalName: goals.lizzy[0], goalCents: goals.lizzy[1], archived: false },
    { id: 'k_jake',  name: 'Jake',  color: '#ffcc4d', emoji: '🚀', goalName: goals.jake[0],  goalCents: goals.jake[1],  archived: false },
    { id: 'k_baby',  name: 'Baby',  color: '#c084fc', emoji: '🍼', goalName: '', goalCents: 0, archived: true },
  ];
}

// Compact row builder: [id, kidId, daysAgo, cents, category, note, status, extra]
function rows(now, list, kidList) {
  const names = Object.fromEntries(kidList.map(k => [k.id, k.name]));
  return list.map(([id, kidId, d, cents, category, note, status, extra = {}]) => {
    const ts = new Date(now - d * 864e5 - (extra.mins || 0) * 6e4).toISOString();
    const isParent = !extra.kidUser;
    const row = {
      id, ts, clientTime: ts, kidId, kidName: names[kidId], amountCents: cents, category, note: note || '', status,
      user: extra.user || (isParent ? 'Dad' : names[kidId]), role: isParent ? 'parent' : 'kid',
      deviceId: extra.deviceId || (isParent ? 'a1b2c3d4' : 'e5f6a7b8'),
      deviceName: extra.deviceName || (isParent ? "Dad's phone" : `${names[kidId]}'s iPad`),
      actedBy: status === 'pending' ? '' : (extra.actedBy || 'Dad'),
      actedAt: status === 'pending' ? '' : ts, actedDeviceName: status === 'pending' ? '' : "Dad's phone",
      editedBy: '', editedAt: '',
      settledAt: extra.settledDaysAgo != null ? new Date(now - extra.settledDaysAgo * 864e5).toISOString() : '',
      settleId: extra.settleId || '', groupId: extra.group || '', reason: extra.reason || '',
    };
    delete row.mins;
    return row;
  });
}

export function testFixture(now = Date.now()) {
  const k = kids({ logan: ['Switch game', 6000], lizzy: ['Art kit', 350], jake: ['', 0] });
  const kidReq = { kidUser: true };
  const tx = rows(now, [
    ['L1', 'k_logan', 10, 2000, 'Chores', 'Mowed the lawn', 'approved', { group: 'gL1' }],
    ['L2', 'k_logan', 10, -200, 'Tithing', 'Tithing · Mowed the lawn', 'approved', { group: 'gL1' }],
    ['L3', 'k_logan', 5, -1500, 'Digital', 'Robux', 'approved'],
    ['L4', 'k_logan', 40, 1000, 'Gift', 'Birthday from Grandma', 'approved'],
    ['L5', 'k_logan', 40, -100, 'Tithing', '', 'approved', { settledDaysAgo: 35, settleId: 's_old' }],
    ['L6', 'k_logan', 100, -500, 'Digital', 'Minecraft', 'approved'],
    ['Z1', 'k_lizzy', 3, 800, 'Chores', 'Dishes all week', 'approved', { group: 'gZ1' }],
    ['Z2', 'k_lizzy', 3, -80, 'Tithing', '', 'approved', { group: 'gZ1' }],
    ['Z3', 'k_lizzy', 2, -350, 'Spending', 'Ice cream', 'approved'],
    ['Z4', 'k_lizzy', 0, 500, 'Chores', 'Folded laundry', 'pending', { ...kidReq, user: 'Lizzy', deviceName: "Lizzy's iPad", mins: 120 }],
    ['J1', 'k_jake', 1, 400, 'Chores', 'Picked up toys', 'approved', { group: 'gJ1' }],
    ['J2', 'k_jake', 1, -40, 'Tithing', '', 'approved', { group: 'gJ1' }],
    ['J3', 'k_jake', 6, 5000, 'Gift', 'Typo', 'void'],
    ['J4', 'k_jake', 7, 10000, 'Gift', '', 'denied'],
    ['J5', 'k_jake', 0, -600, 'Digital', 'Fortnite skin', 'pending', { ...kidReq, mins: 30 }],
  ], k);
  return {
    kids: k, parents: PARENTS.map(p => ({ ...p })), categories: CATEGORIES.map(c => ({ ...c })), transactions: tx,
    settlements: [{ id: 's_old', ts: new Date(now - 35 * 864e5).toISOString(), totalCents: 100, count: 1,
      perKid: 'Logan $1.00', user: 'Dad', deviceName: "Dad's phone", txIds: ['L5'] }],
    sessions: [], audit: [], fails: {},
  };
}

export function sampleFixture(now = Date.now()) {
  const k = kids({ logan: ['Switch game', 6000], lizzy: ['Lego Friends set', 4500], jake: ['Nerf blaster', 2500] });
  const req = { kidUser: true };
  const mom = { user: 'Mom', deviceName: "Mom's phone", deviceId: 'c9d8e7f6', actedBy: 'Mom' };
  const tx = rows(now, [
    ['s01', 'k_logan', 0, 1200, 'Chores', 'Cleaned the garage', 'pending', { ...req, mins: 90, group: 'gs01' }],
    ['s02', 'k_logan', 0, -120, 'Tithing', 'Tithing · Cleaned the garage', 'pending', { ...req, mins: 90, group: 'gs01' }],
    ['s03', 'k_jake', 0, -1000, 'Digital', 'Robux gift card', 'pending', { ...req, mins: 20 }],
    ['s04', 'k_logan', 2, 1500, 'Chores', 'Mowed the lawn', 'approved', { group: 'gs04' }],
    ['s05', 'k_logan', 2, -150, 'Tithing', 'Tithing · Mowed the lawn', 'approved', { group: 'gs04' }],
    ['s06', 'k_lizzy', 3, 800, 'Chores', 'Dishes all week', 'approved', { ...mom, group: 'gs06' }],
    ['s07', 'k_lizzy', 3, -80, 'Tithing', 'Tithing · Dishes all week', 'approved', { ...mom, group: 'gs06' }],
    ['s08', 'k_jake', 4, 500, 'Chores', 'Picked up toys', 'approved', { group: 'gs08' }],
    ['s09', 'k_jake', 4, -50, 'Tithing', 'Tithing · Picked up toys', 'approved', { group: 'gs08' }],
    ['s10', 'k_logan', 5, -2000, 'Digital', 'Minecraft coins', 'approved'],
    ['s11', 'k_lizzy', 6, -400, 'Spending', 'Ice cream with friends', 'approved', mom],
    ['s12', 'k_jake', 8, 2500, 'Gift', 'Lost tooth + birthday', 'approved', { group: 'gs12' }],
    ['s13', 'k_jake', 8, -250, 'Tithing', 'Tithing · Lost tooth + birthday', 'approved', { group: 'gs12' }],
    ['s14', 'k_logan', 9, 1200, 'Chores', 'Washed both cars', 'approved', { group: 'gs14' }],
    ['s15', 'k_logan', 9, -120, 'Tithing', 'Tithing · Washed both cars', 'approved', { group: 'gs14', settledDaysAgo: 1, settleId: 's_sample1' }],
    ['s16', 'k_lizzy', 12, 2500, 'Gift', 'Birthday from Grandma', 'approved', { ...mom, group: 'gs16' }],
    ['s17', 'k_lizzy', 12, -250, 'Tithing', 'Tithing · Birthday from Grandma', 'approved', { ...mom, group: 'gs16', settledDaysAgo: 1, settleId: 's_sample1' }],
    ['s18', 'k_jake', 14, -400, 'Spending', 'Candy run', 'approved', mom],
    ['s19', 'k_logan', 16, -600, 'Digital', 'Fortnite V-Bucks', 'approved'],
    ['s20', 'k_lizzy', 18, 600, 'Chores', 'Raked leaves', 'approved', mom],
    ['s21', 'k_logan', 20, 1800, 'Chores', 'Helped build the shed', 'approved'],
    ['s22', 'k_jake', 22, 300, 'Chores', 'Fed the dog all week', 'approved', mom],
    ['s23', 'k_logan', 35, 2000, 'Gift', 'Report card reward', 'approved'],
    ['s24', 'k_lizzy', 38, -1500, 'Savings', 'Moved to savings account', 'approved', mom],
    ['s25', 'k_logan', 45, -800, 'Digital', 'Roblox game pass', 'approved'],
    ['s26', 'k_lizzy', 50, 3000, 'Gift', 'Christmas from Aunt Sue', 'approved', mom],
    ['s27', 'k_jake', 55, 1000, 'Gift', 'From Grandpa', 'approved'],
    ['s28', 'k_logan', 60, 1000, 'Chores', 'Shoveled the driveway', 'approved'],
  ], k);
  return {
    kids: k, parents: PARENTS.map(p => ({ ...p })), categories: CATEGORIES.map(c => ({ ...c })), transactions: tx,
    settlements: [{ id: 's_sample1', ts: new Date(now - 864e5).toISOString(), totalCents: 370, count: 2,
      perKid: 'Logan $1.20; Lizzy $2.50', user: 'Mom', deviceName: "Mom's phone", txIds: ['s15', 's17'] }],
    sessions: [], audit: [], fails: {},
  };
}

export function buildFixture(name, now) {
  return name === 'test' ? testFixture(now) : sampleFixture(now);
}
