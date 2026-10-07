/*
 * Seed data transcribed from carnivore_stack_log.txt.
 * STACK       – the daily routine template (read-only reference).
 * SUPPLEMENTS – default supplement checklist used by the "Log a Day" form.
 * SEED_JOURNAL – initial day entries + overall notes, loaded on first run.
 */

const STACK = [
  {
    icon: '💧',
    title: 'First Consumption',
    when: 'On waking',
    items: [{ name: 'Water', dose: 'with a pinch of salt' }],
  },
  {
    icon: '🥣',
    title: 'Pre-Meal Drink & Supplements',
    when: 'With 1st meal',
    items: [
      { name: 'Room temp water', dose: '~30–40 fl oz' },
      { name: 'Bone broth powder', dose: '2 scoops' },
      { name: 'Salt', dose: '2 pinches' },
      { name: 'Glutamine powder', dose: '5 g' },
      {
        name: 'OMEGA-3 / D3-K2 combo',
        dose: '1 capsule',
        note: 'D3 50mcg (2,000 IU) · K2 80mcg · EPA/DHA 500mg from fish oil — replaces cod liver oil',
      },
      { name: 'Creatine', dose: '1 scoop' },
      { name: 'Zinc', dose: '50 mg', note: 'Every other day' },
    ],
  },
  {
    icon: '🥩',
    title: 'Meal',
    when: '1st & last meal',
    items: [
      { name: 'Steak', dose: '~11 oz (≈1 steak)' },
      { name: 'Eggs', dose: '3 on 1st meal', note: 'Typically 2 on last meal, up to 3 — based on hunger' },
      { name: 'Butter, grass fed', dose: '1 tbsp' },
    ],
  },
  {
    icon: '🌙',
    title: '2nd Meal Supplement',
    when: 'With 2nd / last meal',
    items: [{ name: 'Magnesium', dose: '500 mg', note: 'Every day' }],
  },
  {
    icon: '🧂',
    title: 'Last Consumption',
    when: 'End of day',
    items: [{ name: 'Water', dose: '4 oz with a pinch of salt' }],
  },
];

const SUPPLEMENTS = [
  { name: 'Bone broth powder', dose: '2 scoops', timing: 'Pre-meal drink' },
  { name: 'L-glutamine', dose: '5 g', timing: 'Pre-meal drink' },
  { name: 'Creatine', dose: '1 scoop', timing: 'Pre-meal drink' },
  { name: 'OMEGA-3/D3-K2', dose: '1 capsule (D3 50mcg, K2 80mcg, EPA/DHA 500mg)', timing: '1st meal' },
  { name: 'Zinc', dose: '50 mg', timing: '1st meal', everyOtherDay: true },
  { name: 'Magnesium', dose: '500 mg', timing: '2nd meal' },
];

const SEED_JOURNAL = {
  version: 1,
  days: [
    {
      id: 'seed-day-1',
      dayNumber: 1,
      date: '',
      onPlan: true,
      hunger: 'Mild',
      energy: 'Neutral',
      symptoms: [],
      symptomNotes: 'Half-ass hunger — not strong, not urgent, just a mild "I could eat" feeling.\nNo major discomfort reported.',
      food: {
        drink: 'Bone broth + L-glutamine + creatine (1 scoop) in lightly salted water',
        waterOz: '30–40',
        meals: [
          { label: 'Meal 1', steakOz: '', eggs: '', butterTbsp: '', notes: 'Steak and eggs' },
          { label: 'Meal 2', steakOz: '', eggs: 3, butterTbsp: '', notes: 'Just eggs' },
        ],
        notes: '',
      },
      supplements: [
        { name: 'Bone broth powder', dose: '2 scoops', timing: 'Pre-meal drink', taken: true },
        { name: 'L-glutamine', dose: '5 g', timing: 'Pre-meal drink', taken: true },
        { name: 'Creatine', dose: '1 scoop', timing: 'Pre-meal drink', taken: true },
        { name: 'OMEGA-3/D3-K2', dose: '1 capsule (D3 50mcg, K2 80mcg, EPA/DHA 500mg)', timing: '1st meal', taken: true },
        { name: 'Zinc', dose: '50 mg', timing: '1st meal', taken: true },
        { name: 'Magnesium', dose: '500 mg', timing: '2nd meal', taken: true },
      ],
      activity: [{ type: 'Walk', amount: '1 mile', intensity: 'Easy', notes: "Didn't push hard" }],
      mindset: "Stayed disciplined and didn't cave.\nWalked a mile but didn't push hard — energy felt neutral.",
    },
    {
      id: 'seed-day-2',
      dayNumber: 2,
      date: '',
      onPlan: true,
      hunger: 'Neutral',
      energy: 'Neutral',
      symptoms: [
        { name: 'Headache', severity: 2, notes: 'Came and went — 2 occurrences, each no longer than 30 minutes' },
        { name: 'Loose / watery stools', severity: 3, notes: '' },
        { name: 'Carb cravings', severity: 2, notes: "Identified as non-hunger signals — didn't cave" },
      ],
      symptomNotes: '',
      food: {
        drink: 'Bone broth + L-glutamine + creatine (1 scoop) in lightly salted water',
        waterOz: '30–40',
        meals: [
          { label: 'Meal 1', steakOz: '', eggs: 3, butterTbsp: '', notes: 'Steak' },
          { label: 'Meal 2', steakOz: '', eggs: 3, butterTbsp: '', notes: 'Steak' },
        ],
        notes: 'Same drink routine as Day 1.',
      },
      supplements: [
        { name: 'Bone broth powder', dose: '2 scoops', timing: 'Pre-meal drink', taken: true },
        { name: 'L-glutamine', dose: '5 g', timing: 'Pre-meal drink', taken: true },
        { name: 'Creatine', dose: '1 scoop', timing: 'Pre-meal drink', taken: true },
        { name: 'OMEGA-3/D3-K2', dose: '1 capsule (D3 50mcg, K2 80mcg, EPA/DHA 500mg)', timing: '1st meal', taken: true },
        { name: 'Zinc', dose: '50 mg', timing: '1st meal', taken: false },
        { name: 'Magnesium', dose: '500 mg', timing: '2nd meal', taken: true },
      ],
      activity: [],
      mindset:
        "Stayed consistent with my routine.\nDidn't force food — ate when hungry.\nStayed disciplined against cravings.\nKept hydration and electrolytes in my routine.\nEnded Day 2 clean, without breaking the diet.",
    },
  ],
  meta: {
    patternNotes: {
      Hunger: 'Day 1: mild hunger.\nDay 2: more neutral.',
      Cravings: 'Carb cravings on Day 2, but recognized as psychological, not physiological.',
      Digestion: 'Day 2 brought noticeable digestive changes (loose stools).',
      'Energy / Mood': 'Neutral — not high-output, not drained.',
      Consistency:
        "Stayed on plan both days.\nAte clean.\nDidn't cave to cravings.\nKept supplement routine stable.\nListened to hunger signals.",
    },
    summary:
      'Completed two full days cleanly, stayed disciplined through cravings, ate when hungry, kept the routine stable, and experienced normal early-transition symptoms like headaches and digestive changes.',
  },
};
