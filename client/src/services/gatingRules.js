/**
 * On-Device Amazon Gating & Restrictions Knowledge Base
 * Runs 100% locally on the phone with zero server required ($0 cost)
 */

// 1. Hard-Gated Academic & Textbook Publishers
export const GATED_BOOK_PUBLISHERS = [
  {
    name: 'Pearson',
    keywords: ['pearson', 'addison-wesley', 'addison wesley', 'prentice hall', 'allyn & bacon', 'benjamin cummings', 'longman', 'peachpit', 'que publishing', 'merrill'],
    severity: 'HARD_GATED',
    reason: 'Pearson requires official distributor invoices (Ingram/Baker & Taylor) showing 10+ units.',
    autoApprovable: false
  },
  {
    name: 'McGraw-Hill',
    keywords: ['mcgraw-hill', 'mcgraw hill', 'glencoe', 'schaum', 'irwin', 'osborne'],
    severity: 'HARD_GATED',
    reason: 'McGraw-Hill requires wholesale distributor invoices with counterfeit safeguards.',
    autoApprovable: false
  },
  {
    name: 'Cengage Learning',
    keywords: ['cengage', 'wadsworth', 'brooks/cole', 'brooks cole', 'south-western', 'delmar', 'course technology', 'heinle'],
    severity: 'HARD_GATED',
    reason: 'Cengage strictly enforces brand authorization and 10-unit distributor invoices.',
    autoApprovable: false
  },
  {
    name: 'John Wiley & Sons',
    keywords: ['john wiley', 'wiley & sons', 'wiley', 'jossey-bass', 'jossey bass', 'for dummies'],
    severity: 'HARD_GATED',
    reason: 'Wiley requires wholesale distributor invoices to sell on Amazon.',
    autoApprovable: false
  },
  {
    name: 'Elsevier Health Sciences',
    keywords: ['elsevier', 'saunders', 'mosby', 'churchill livingstone', 'academic press', 'butterworth-heinemann'],
    severity: 'HARD_GATED',
    reason: 'Elsevier medical and science texts require manufacturer/distributor authorization.',
    autoApprovable: false
  },
  {
    name: 'Oxford University Press',
    keywords: ['oxford university press', 'oup usa', 'oxford up'],
    severity: 'HARD_GATED',
    reason: 'Oxford UP enforces distributor ungating for academic editions.',
    autoApprovable: false
  },
  {
    name: 'Cambridge University Press',
    keywords: ['cambridge university press', 'cup usa'],
    severity: 'HARD_GATED',
    reason: 'Cambridge UP requires distributor invoices for academic titles.',
    autoApprovable: false
  },
  {
    name: 'Macmillan Higher Education',
    keywords: ['macmillan', 'bedford', "st. martin's", 'w.h. freeman', 'worth publishers', 'palgrave'],
    severity: 'HARD_GATED',
    reason: 'Macmillan textbook lines require authorized distributor paperwork.',
    autoApprovable: false
  },
  {
    name: 'W.W. Norton & Company',
    keywords: ['w. w. norton', 'w.w. norton', 'norton & company'],
    severity: 'HARD_GATED',
    reason: 'Norton anthologies and college texts frequently require distributor ungating.',
    autoApprovable: false
  },
  {
    name: 'Wolters Kluwer / Lippincott',
    keywords: ['wolters kluwer', 'lippincott williams & wilkins', 'lww', 'aspen publishers'],
    severity: 'HARD_GATED',
    reason: 'Wolters Kluwer medical and legal titles are gated for third-party sellers.',
    autoApprovable: false
  },
  {
    name: 'Springer Nature',
    keywords: ['springer', 'springer nature', 'birkhauser', 'humana press'],
    severity: 'HARD_GATED',
    reason: 'Springer academic monographs require authorization.',
    autoApprovable: false
  },
  {
    name: 'Jones & Bartlett Learning',
    keywords: ['jones & bartlett', 'jones and bartlett'],
    severity: 'HARD_GATED',
    reason: 'Jones & Bartlett nursing/health sciences are gated.',
    autoApprovable: false
  },
  {
    name: 'F.A. Davis',
    keywords: ['f.a. davis', 'fa davis'],
    severity: 'HARD_GATED',
    reason: 'F.A. Davis nursing and medical guides require distributor invoices.',
    autoApprovable: false
  }
];

// 2. Gated Media Studios (DVD & Blu-ray)
export const GATED_MEDIA_STUDIOS = [
  {
    name: 'Walt Disney Studios',
    keywords: ['disney', 'walt disney', 'pixar', 'marvel studios', 'marvel', 'lucasfilm', 'star wars'],
    severity: 'HARD_GATED',
    reason: 'Disney titles are strictly gated. Requires wholesale distributor authorization.',
    autoApprovable: false
  },
  {
    name: 'Warner Bros. Entertainment',
    keywords: ['warner bros', 'warner home video', 'new line cinema', 'dc entertainment', 'dc comics'],
    severity: 'HARD_GATED',
    reason: 'Warner Bros. releases (especially DC / Harry Potter) are gated against counterfeit.',
    autoApprovable: false
  },
  {
    name: 'Sony Pictures Home Entertainment',
    keywords: ['sony pictures', 'columbia pictures', 'tristar'],
    severity: 'HARD_GATED',
    reason: 'Sony Pictures media is restricted on Amazon for non-approved sellers.',
    autoApprovable: false
  },
  {
    name: 'Paramount Home Media',
    keywords: ['paramount', 'paramount pictures', 'cbs home entertainment'],
    severity: 'HARD_GATED',
    reason: 'Paramount DVD and Blu-ray catalog is gated.',
    autoApprovable: false
  },
  {
    name: 'Universal Pictures Home Entertainment',
    keywords: ['universal pictures', 'universal studios', 'focus features', 'dreamworks animation'],
    severity: 'HARD_GATED',
    reason: 'Universal releases require studio ungating.',
    autoApprovable: false
  },
  {
    name: '20th Century Studios / Fox',
    keywords: ['20th century', 'twentieth century', 'fox home entertainment'],
    severity: 'HARD_GATED',
    reason: '20th Century Fox media titles are restricted under Disney umbrella.',
    autoApprovable: false
  },
  {
    name: 'Home Box Office (HBO)',
    keywords: ['hbo', 'home box office', 'game of thrones'],
    severity: 'HARD_GATED',
    reason: 'HBO box sets are heavily counterfeited and strictly gated.',
    autoApprovable: false
  },
  {
    name: 'The Criterion Collection',
    keywords: ['criterion collection', 'criterion'],
    severity: 'CAUTION',
    reason: 'Selected Criterion Blu-rays are gated or subject to price caps.',
    autoApprovable: true
  }
];

// 3. Gated Video Game Brands
export const GATED_VIDEO_GAME_BRANDS = [
  {
    name: 'Nintendo',
    keywords: ['nintendo', 'switch', 'pokemon', 'pokémon', 'mario', 'zelda', 'game boy', 'gamecube', '3ds', 'ds'],
    severity: 'HARD_GATED',
    reason: 'Nintendo first-party titles and consoles are gated for third-party sellers.',
    autoApprovable: false
  },
  {
    name: 'Sony PlayStation',
    keywords: ['playstation', 'sony interactive', 'ps5', 'ps4', 'ps3', 'dualshock', 'dualsense'],
    severity: 'CAUTION',
    reason: 'PlayStation hardware, controllers, and select AAA software are brand gated.',
    autoApprovable: false
  },
  {
    name: 'Microsoft Xbox',
    keywords: ['xbox', 'microsoft studios', 'xbox series', 'xbox one'],
    severity: 'CAUTION',
    reason: 'Xbox hardware and major first-party titles may require brand ungating.',
    autoApprovable: false
  },
  {
    name: 'Electronic Arts (EA)',
    keywords: ['electronic arts', 'ea sports', 'madden', 'fifa'],
    severity: 'CAUTION',
    reason: 'Recent annual sports titles often have selling approval requirements.',
    autoApprovable: true
  }
];

/**
 * Check if an item is restricted based on title, publisher, brand, or category
 */
export function evaluateRestrictions(itemData) {
  const { title = '', publisher = '', brand = '', category = '', msrp = 0 } = itemData;
  const searchableText = `${title} ${publisher} ${brand} ${category}`.toLowerCase();

  // 1. Check DVD / Blu-ray MSRP Threshold rule
  if (category.toLowerCase().includes('dvd') || category.toLowerCase().includes('movie') || searchableText.includes('dvd')) {
    if (msrp >= 25) {
      return {
        status: 'HARD_GATED',
        badge: 'RESTRICTED',
        badgeColor: '#E53E3E',
        reason: 'DVD MSRP exceeds $25 (Amazon blanket restriction on high-MSRP DVDs)',
        canSell: false,
        requiresInvoices: true
      };
    }
  }

  // 2. Check Book Publishers
  for (const pub of GATED_BOOK_PUBLISHERS) {
    for (const kw of pub.keywords) {
      if (searchableText.includes(kw)) {
        return {
          status: pub.severity,
          badge: pub.severity === 'HARD_GATED' ? 'HARD GATED' : 'CAUTION',
          badgeColor: pub.severity === 'HARD_GATED' ? '#E53E3E' : '#DD6B20',
          matchedName: pub.name,
          reason: pub.reason,
          canSell: false,
          requiresInvoices: !pub.autoApprovable
        };
      }
    }
  }

  // 3. Check Media Studios
  for (const studio of GATED_MEDIA_STUDIOS) {
    for (const kw of studio.keywords) {
      if (searchableText.includes(kw)) {
        return {
          status: studio.severity,
          badge: studio.severity === 'HARD_GATED' ? 'RESTRICTED' : 'CAUTION',
          badgeColor: studio.severity === 'HARD_GATED' ? '#E53E3E' : '#DD6B20',
          matchedName: studio.name,
          reason: studio.reason,
          canSell: false,
          requiresInvoices: !studio.autoApprovable
        };
      }
    }
  }

  // 4. Check Video Game Brands
  for (const gameBrand of GATED_VIDEO_GAME_BRANDS) {
    for (const kw of gameBrand.keywords) {
      if (searchableText.includes(kw)) {
        return {
          status: gameBrand.severity,
          badge: gameBrand.severity === 'HARD_GATED' ? 'RESTRICTED' : 'CAUTION',
          badgeColor: gameBrand.severity === 'HARD_GATED' ? '#E53E3E' : '#DD6B20',
          matchedName: gameBrand.name,
          reason: gameBrand.reason,
          canSell: gameBrand.severity !== 'HARD_GATED',
          requiresInvoices: !gameBrand.autoApprovable
        };
      }
    }
  }

  // Default: Open / Ungated
  return {
    status: 'UNGATED',
    badge: 'SAFE TO SELL',
    badgeColor: '#38A169',
    reason: 'No publisher, brand, or studio restrictions detected. Safe to list.',
    canSell: true,
    requiresInvoices: false
  };
}
