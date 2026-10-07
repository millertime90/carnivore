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
  days: [],
  meta: {
    patternNotes: {
      Hunger: '',
      Cravings: '',
      Digestion: '',
      'Energy / Mood': '',
      Consistency: '',
    },
    summary: '',
  },
};
