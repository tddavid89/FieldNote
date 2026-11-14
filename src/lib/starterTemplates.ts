import { ItemCategory } from '../types/research';

export interface StarterTemplate {
  title: string;
  userPrompt: string;
  category: ItemCategory;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    title: 'iCloud+ vs Google Photos — which storage plan is worth paying for?',
    userPrompt:
      'Compare 200GB and 2TB tiers, family sharing, iOS vs cross-platform support, search/AI features, and export ease.',
    category: 'comparison',
  },
  {
    title: 'The Creative Act by Rick Rubin — library & cheapest format prices',
    userPrompt:
      'Check public library ebook/audiobook availability (Libby/Hoopla) plus cheapest Kindle ebook, physical paperback/hardcover, and audiobook cost.',
    category: 'reading',
  },
  {
    title: '2024 Honda CR-V Hybrid Sport — availability and prices near me',
    userPrompt:
      'Check typical market price range, local dealership or used listing availability near my location, and key trim notes.',
    category: 'shopping',
  },
  {
    title: 'Student loan payment options — current federal IDR/SAVE vs switching',
    userPrompt:
      'Compare current federal student loan repayment status, IBR/PAYE/Standard options, monthly payment impact, and forgiveness timelines.',
    category: 'finance',
  },
  {
    title: 'Money market funds — highest yield with strongest tax protection',
    userPrompt:
      'Compare top Treasury-only money market funds (e.g., VUSXX, FDLXX) vs municipal money market funds and bank MMAs for current 7-day SEC yield and state/federal tax treatment.',
    category: 'finance',
  },
];
