/**
 * Amazon Gating & Restrictions Knowledge Base
 * 
 * Flags brands, publishers, and studios that Amazon hard-gates
 * (requiring 10-unit distributor invoices from Ingram, Baker & Taylor, etc.)
 * or brand authorization letters.
 */

function matchKeyword(text, keyword) {
  const cleanKw = keyword.toLowerCase();
  if (/^[a-z0-9&]+$/i.test(cleanKw) && cleanKw.length <= 4) {
    const regex = new RegExp('(?:^|[^a-z0-9])' + cleanKw + '(?:[^a-z0-9]|$)', 'i');
    return regex.test(text);
  }
  return text.toLowerCase().includes(cleanKw);
}

// 1. Hard-Gated Academic & Textbook Publishers (Strict distributor invoice required)
const GATED_BOOK_PUBLISHERS = [
  // --- Academic & Medical Textbooks (Hard-Gated: 10-Unit Distributor Invoices Mandatory) ---
  {
    name: 'Pearson',
    keywords: ['pearson', 'addison-wesley', 'addison wesley', 'prentice hall', 'allyn & bacon', 'benjamin cummings', 'longman', 'peachpit', 'que publishing', 'merrill'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Pearson academic line strictly requires 10-unit wholesale invoices from authorized distributors (Ingram/Baker & Taylor). Thrift store receipts are NOT accepted.',
    autoApprovable: false
  },
  {
    name: 'McGraw-Hill',
    keywords: ['mcgraw-hill', 'mcgraw hill', 'glencoe', 'schaum', 'irwin', 'osborne'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'McGraw-Hill requires wholesale distributor invoices with counterfeit safeguards.',
    autoApprovable: false
  },
  {
    name: 'Cengage Learning',
    keywords: ['cengage', 'wadsworth', 'brooks/cole', 'brooks cole', 'south-western', 'delmar', 'course technology', 'heinle'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Cengage strictly enforces brand authorization and 10-unit distributor invoices.',
    autoApprovable: false
  },
  {
    name: 'John Wiley & Sons',
    keywords: ['john wiley', 'wiley & sons', 'wiley', 'jossey-bass', 'jossey bass', 'for dummies'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Wiley requires wholesale distributor invoices to sell on Amazon.',
    autoApprovable: false
  },
  {
    name: 'Elsevier Health Sciences',
    keywords: ['elsevier', 'saunders', 'mosby', 'churchill livingstone', 'academic press', 'butterworth-heinemann'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Elsevier medical and science texts require manufacturer/distributor authorization.',
    autoApprovable: false
  },
  {
    name: 'Oxford University Press',
    keywords: ['oxford university press', 'oup usa', 'oxford up'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Oxford UP enforces distributor ungating for academic editions.',
    autoApprovable: false
  },
  {
    name: 'Cambridge University Press',
    keywords: ['cambridge university press', 'cup usa', 'cambridge up'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Cambridge UP requires distributor invoices for academic titles.',
    autoApprovable: false
  },
  {
    name: 'Macmillan Higher Education',
    keywords: ['bedford', 'w.h. freeman', 'worth publishers', 'palgrave'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Macmillan college textbook lines require authorized distributor paperwork.',
    autoApprovable: false
  },
  {
    name: 'W.W. Norton & Company',
    keywords: ['w. w. norton', 'w.w. norton', 'norton & company'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Norton anthologies and college texts frequently require distributor ungating.',
    autoApprovable: false
  },
  {
    name: 'Wolters Kluwer / Lippincott',
    keywords: ['wolters kluwer', 'lippincott williams & wilkins', 'lippincott', 'lww', 'aspen publishers'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Wolters Kluwer medical and legal titles are gated for third-party sellers.',
    autoApprovable: false
  },
  {
    name: 'Springer Nature',
    keywords: ['springer', 'springer nature', 'birkhauser', 'humana press'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Springer academic monographs require authorization.',
    autoApprovable: false
  },
  {
    name: 'Jones & Bartlett Learning',
    keywords: ['jones & bartlett', 'jones and bartlett'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Jones & Bartlett nursing/health sciences are gated.',
    autoApprovable: false
  },
  {
    name: 'Nelson Education (Canada)',
    keywords: ['nelson education', 'nelson thomson', 'nelson college', 'thomson nelson', 'nelson series'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Nelson Education Canada requires wholesale distributor authorization to resell.',
    autoApprovable: false
  },
  {
    name: 'McGraw-Hill Ryerson (Canada)',
    keywords: ['mcgraw-hill ryerson', 'mcgraw hill ryerson', 'ryerson press'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'McGraw-Hill Ryerson requires wholesale distributor invoices with counterfeit safeguards.',
    autoApprovable: false
  },
  {
    name: 'Emond Publishing (Canada)',
    keywords: ['emond montgomery', 'emond publishing', 'emond legal'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'Emond Canadian legal/college texts are gated for third-party sellers.',
    autoApprovable: false
  },
  {
    name: 'F.A. Davis',
    keywords: ['f.a. davis', 'fa davis'],
    severity: 'HARD_GATED',
    badge: '⛔ HARD GATED (INVOICE)',
    badgeColor: '#E53E3E',
    reason: 'F.A. Davis nursing and medical guides require distributor invoices.',
    autoApprovable: false
  },

  // --- Major Trade ("Big 5") & Brand Gated Publishers (Candidate for Instant Auto-Approval) ---
  {
    name: 'Penguin Random House',
    keywords: [
      'penguin random house', 'penguin', 'random house', 'viking', 'doubleday', 'knopf', 'alfred a. knopf',
      'crown', 'pantheon', 'ballantine', 'bantam', 'dell', 'berkley', 'dutton', 'putnam', 'g.p. putnam',
      'riverhead', 'avery', 'anchor', 'vintage', 'plume', 'signet', 'ace', 'daw', 'dial', 'puffin',
      'amphoto', 'ten speed', 'clarkson potter', 'delacorte', 'razorbill', 'waterbrook', 'multnomah',
      'portfolio', 'sentinel', 'tarcher'
    ],
    severity: 'APPROVAL_REQUIRED',
    badge: '⚠️ APPROVAL REQUIRED',
    badgeColor: '#DD6B20',
    reason: 'Penguin Random House brand restriction. Amazon gates this for newer accounts. Tap "⚡ Check Auto-Approval" below — if auto-approved on your account, you can buy; if invoices are required, pass!',
    autoApprovable: true
  },
  {
    name: 'HarperCollins',
    keywords: [
      'harpercollins', 'harper collins', 'william morrow', 'morrow', 'avon', 'balzer + bray', 'balzer & bray',
      'balzer and bray', 'harlequin', 'harperteen', 'amistad', 'ecco', 'broadside', 'thomas nelson',
      'zondervan', 'harperone', 'harper wave', 'harper business', 'clarion books', 'harper'
    ],
    severity: 'APPROVAL_REQUIRED',
    badge: '⚠️ APPROVAL REQUIRED',
    badgeColor: '#DD6B20',
    reason: 'HarperCollins brand restriction. Amazon gates this for newer accounts. Tap "⚡ Check Auto-Approval" below — if auto-approved on your account, you can buy; if invoices are required, pass!',
    autoApprovable: true
  },
  {
    name: 'Simon & Schuster',
    keywords: [
      'simon & schuster', 'simon and schuster', 'scribner', 'atria', 'pocket books', 'gallery books',
      'touchstone', 'free press', 'aladdin', 'simon pulse', 'threshold editions', 'howard books', 'adams media'
    ],
    severity: 'APPROVAL_REQUIRED',
    badge: '⚠️ APPROVAL REQUIRED',
    badgeColor: '#DD6B20',
    reason: 'Simon & Schuster brand restriction. Amazon gates this for newer accounts. Tap "⚡ Check Auto-Approval" below — if auto-approved on your account, you can buy; if invoices are required, pass!',
    autoApprovable: true
  },
  {
    name: 'Macmillan',
    keywords: [
      'macmillan', 'st. martin', 'st martin', 'st. martins', 'st martins', 'tor books', 'tor', 'forge',
      'farrar, straus', 'farrar straus', 'fsg', 'henry holt', 'flatiron', 'celadon', 'picador',
      'roaring brook', 'feiwel', 'first second'
    ],
    severity: 'APPROVAL_REQUIRED',
    badge: '⚠️ APPROVAL REQUIRED',
    badgeColor: '#DD6B20',
    reason: 'Macmillan brand restriction. Amazon gates this for newer accounts. Tap "⚡ Check Auto-Approval" below — if auto-approved on your account, you can buy; if invoices are required, pass!',
    autoApprovable: true
  },
  {
    name: 'Hachette Book Group',
    keywords: [
      'hachette', 'little, brown', 'little brown', 'grand central', 'orbit', 'faithwords', 'basic books',
      'center street', 'publicaffairs', 'running press', 'perseus', 'da capo', 'seal press', 'black dog & leventhal'
    ],
    severity: 'APPROVAL_REQUIRED',
    badge: '⚠️ APPROVAL REQUIRED',
    badgeColor: '#DD6B20',
    reason: 'Hachette Book Group brand restriction. Amazon gates this for newer accounts. Tap "⚡ Check Auto-Approval" below — if auto-approved on your account, you can buy; if invoices are required, pass!',
    autoApprovable: true
  },
  {
    name: 'Scholastic',
    keywords: [
      'scholastic', 'arthur a. levine', 'orchard books', 'cartwheel books', 'cartwheel', 'klutz', 'goosebumps'
    ],
    severity: 'APPROVAL_REQUIRED',
    badge: '⚠️ APPROVAL REQUIRED',
    badgeColor: '#DD6B20',
    reason: 'Scholastic brand restriction. Amazon gates popular children\'s books for newer accounts. Tap "⚡ Check Auto-Approval" below to test eligibility.',
    autoApprovable: true
  },
  {
    name: 'Disney Book Group',
    keywords: [
      'disney press', 'disney-hyperion', 'disney hyperion', 'disney book', 'marvel press', 'lucasfilm press', 'national geographic kids'
    ],
    severity: 'APPROVAL_REQUIRED',
    badge: '⚠️ APPROVAL REQUIRED',
    badgeColor: '#DD6B20',
    reason: 'Disney Book Group brand restriction. Disney publishing lines are gated on Amazon. Tap "⚡ Check Auto-Approval" below to test eligibility.',
    autoApprovable: true
  }
];

// 2. Gated Media Studios (DVD & Blu-ray)
const GATED_MEDIA_STUDIOS = [
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
    name: 'Entertainment One / eOne (Canada)',
    keywords: ['entertainment one', 'eone', 'e-one'],
    severity: 'HARD_GATED',
    reason: 'eOne Canadian film and television releases are restricted.',
    autoApprovable: false
  },
  {
    name: 'Alliance Films (Canada)',
    keywords: ['alliance films', 'alliance atlantis', 'alliance vivafilm'],
    severity: 'HARD_GATED',
    reason: 'Alliance Films Canadian media releases are restricted.',
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
const GATED_VIDEO_GAME_BRANDS = [
  {
    name: 'Nintendo',
    keywords: ['nintendo', 'nintendo switch', 'pokemon', 'pokémon', 'mario', 'zelda', 'game boy', 'gameboy', 'gamecube', 'nintendo 3ds', 'nintendo ds'],
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

// 4. ISBN Publisher Prefix Registry (Direct Gating Identification by Barcode)
const ISBN_PUBLISHER_PREFIXES = [
  // Pearson (Academic Hard Gated)
  { prefixes: ['978013', '013', '9780201', '0201', '9780321', '0321', '9780134', '0134'], publisher: 'Pearson', severity: 'HARD_GATED', badge: '⛔ HARD GATED (INVOICE)', reason: 'Pearson academic line strictly requires 10-unit wholesale distributor invoices.' },
  // McGraw-Hill (Academic Hard Gated)
  { prefixes: ['978007', '007', '9780071', '0071', '9780073', '0073', '9780078', '0078'], publisher: 'McGraw-Hill', severity: 'HARD_GATED', badge: '⛔ HARD GATED (INVOICE)', reason: 'McGraw-Hill requires wholesale distributor invoices with counterfeit safeguards.' },
  // Wiley (Academic Hard Gated)
  { prefixes: ['9780471', '0471', '9780470', '0470', '9781118', '1118', '9781119', '1119'], publisher: 'John Wiley & Sons', severity: 'HARD_GATED', badge: '⛔ HARD GATED (INVOICE)', reason: 'Wiley requires wholesale distributor invoices to sell on Amazon.' },
  // Cengage (Academic Hard Gated)
  { prefixes: ['9780538', '0538', '9781285', '1285', '9781305', '1305', '9780618', '0618', '9780534', '0534'], publisher: 'Cengage Learning', severity: 'HARD_GATED', badge: '⛔ HARD GATED (INVOICE)', reason: 'Cengage strictly enforces brand authorization and 10-unit distributor invoices.' },

  // Macmillan / St. Martin's Press (Big 5 Approval Required)
  { prefixes: ['9780312', '0312', '9780374', '0374', '97808050', '08050', '97807653', '07653', '9781250', '1250'], publisher: "St. Martin's Press (Macmillan)", severity: 'APPROVAL_REQUIRED', badge: '⚠️ APPROVAL REQUIRED', reason: 'Macmillan brand restriction (St. Martin\'s Press / Tor / FSG). Amazon gates this for newer accounts. Tap "⚡ Check in Amazon Seller App" below.' },
  // Penguin Random House (Big 5 Approval Required)
  { prefixes: ['9780385', '0385', '9780394', '0394', '9780375', '0375', '9780679', '0679', '978014', '014', '9780670', '0670', '9780440', '0440', '9780553', '0553', '9780345', '0345', '9780425', '0425', '9780451', '0451', '9780452', '0452', '9780593', '0593'], publisher: 'Penguin Random House', severity: 'APPROVAL_REQUIRED', badge: '⚠️ APPROVAL REQUIRED', reason: 'Penguin Random House brand restriction. Amazon gates this for newer accounts. Tap "⚡ Check in Amazon Seller App" below.' },
  // HarperCollins (Big 5 Approval Required)
  { prefixes: ['978006', '006', '9780688', '0688', '9780380', '0380', '9780060', '0060', '9780061', '0061', '9780062', '0062'], publisher: 'HarperCollins', severity: 'APPROVAL_REQUIRED', badge: '⚠️ APPROVAL REQUIRED', reason: 'HarperCollins brand restriction. Amazon gates this for newer accounts. Tap "⚡ Check in Amazon Seller App" below.' },
  // Simon & Schuster (Big 5 Approval Required)
  { prefixes: ['9780671', '0671', '9780684', '0684', '97807432', '07432', '97807434', '07434', '97814165', '14165', '97815011', '15011'], publisher: 'Simon & Schuster', severity: 'APPROVAL_REQUIRED', badge: '⚠️ APPROVAL REQUIRED', reason: 'Simon & Schuster brand restriction. Amazon gates this for newer accounts. Tap "⚡ Check in Amazon Seller App" below.' },
  // Hachette Book Group (Big 5 Approval Required)
  { prefixes: ['9780316', '0316', '9780446', '0446', '97814555', '14555', '97804465', '04465'], publisher: 'Hachette Book Group', severity: 'APPROVAL_REQUIRED', badge: '⚠️ APPROVAL REQUIRED', reason: 'Hachette Book Group brand restriction. Amazon gates this for newer accounts. Tap "⚡ Check in Amazon Seller App" below.' },
  // Scholastic (Approval Required)
  { prefixes: ['9780590', '0590', '9780439', '0439', '9780545', '0545', '9781338', '1338'], publisher: 'Scholastic', severity: 'APPROVAL_REQUIRED', badge: '⚠️ APPROVAL REQUIRED', reason: 'Scholastic brand restriction. Amazon gates popular children\'s books for newer accounts. Tap "⚡ Check in Amazon Seller App" below.' },
  // Disney Book Group (Approval Required)
  { prefixes: ['97807868', '07868', '97814231', '14231', '97814847', '14847', '9781368', '1368'], publisher: 'Disney Book Group', severity: 'APPROVAL_REQUIRED', badge: '⚠️ APPROVAL REQUIRED', reason: 'Disney Book Group brand restriction. Disney books are gated on Amazon. Tap "⚡ Check in Amazon Seller App" below.' }
];

function checkIsbnPrefix(barcode) {
  const clean = (barcode || '').replace(/[^0-9X]/gi, '');
  for (const entry of ISBN_PUBLISHER_PREFIXES) {
    for (const p of entry.prefixes) {
      if (clean.startsWith(p)) {
        return entry;
      }
    }
  }
  return null;
}

/**
 * Check if an item is restricted based on title, publisher, brand, or category
 */
function evaluateRestrictions(itemData) {
  const { title = '', publisher = '', allPublishers = [], brand = '', author = '', category = '', barcode = '', asin = '', msrp = 0 } = itemData;

  const cleanTitle = (title || '').trim().toLowerCase();
  const cleanPublisher = (publisher || '').trim().toLowerCase();
  const cleanBrand = (brand || '').trim().toLowerCase();

  // 1. Direct ISBN Prefix Check (Mathematical certainty from barcode)
  const prefixMatch = checkIsbnPrefix(barcode) || checkIsbnPrefix(asin);
  if (prefixMatch) {
    return {
      status: prefixMatch.severity,
      badge: prefixMatch.badge || (prefixMatch.severity === 'HARD_GATED' ? '⛔ HARD GATED (INVOICE)' : '⚠️ APPROVAL REQUIRED'),
      badgeColor: prefixMatch.severity === 'HARD_GATED' ? '#E53E3E' : '#DD6B20',
      matchedName: prefixMatch.publisher,
      reason: prefixMatch.reason,
      canSell: false,
      requiresInvoices: prefixMatch.severity === 'HARD_GATED'
    };
  }

  // If the item is unknown / unverified, restrictions cannot be determined
  const isUnknown = !cleanTitle || 
                    cleanTitle === 'unknown item' || 
                    cleanTitle === 'unknown product' || 
                    cleanTitle === 'unknown' ||
                    cleanTitle.startsWith('item queued offline');

  if (isUnknown && !cleanPublisher && !cleanBrand) {
    return {
      status: 'UNKNOWN',
      badge: '⚠️ UNKNOWN (CHECK CENTRAL)',
      badgeColor: '#ECC94B', // Bold Warning Yellow
      textColor: '#1A202C',  // High-contrast dark text on bright yellow
      reason: 'Product metadata could not be verified. Publisher, brand, and gating restrictions are UNKNOWN. Tap 1-Tap Seller Central below to verify eligibility before purchasing.',
      canSell: null,
      requiresInvoices: false
    };
  }

  const allPubsStr = Array.isArray(allPublishers) ? allPublishers.join(' ') : '';
  const searchableText = `${title} ${publisher} ${allPubsStr} ${brand} ${author} ${category}`.toLowerCase();

  // 1. Check DVD / Blu-ray MSRP Threshold rule (Amazon gates DVDs with MSRP > $25)
  if (category.toLowerCase().includes('dvd') || category.toLowerCase().includes('movie') || searchableText.includes('dvd')) {
    if (msrp >= 25) {
      return {
        status: 'HARD_GATED',
        badge: '⛔ HARD GATED (INVOICE)',
        badgeColor: '#E53E3E',
        reason: 'DVD MSRP exceeds $25 (Amazon blanket restriction on high-MSRP DVDs requiring invoices)',
        canSell: false,
        requiresInvoices: true
      };
    }
  }

  // 2. Check Book Publishers
  for (const pub of GATED_BOOK_PUBLISHERS) {
    for (const kw of pub.keywords) {
      if (matchKeyword(searchableText, kw)) {
        return {
          status: pub.severity,
          badge: pub.badge || (pub.severity === 'HARD_GATED' ? '⛔ HARD GATED (INVOICE)' : '⚠️ APPROVAL REQUIRED'),
          badgeColor: pub.badgeColor || (pub.severity === 'HARD_GATED' ? '#E53E3E' : '#DD6B20'),
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
      if (matchKeyword(searchableText, kw)) {
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
      if (matchKeyword(searchableText, kw)) {
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
    badge: '🟢 NO KNOWN GATING',
    badgeColor: '#38A169',
    reason: 'No publisher brand restrictions detected in database. Tap "Check Seller Central" to confirm eligibility for your account.',
    canSell: true,
    requiresInvoices: false
  };
}

module.exports = {
  GATED_BOOK_PUBLISHERS,
  GATED_MEDIA_STUDIOS,
  GATED_VIDEO_GAME_BRANDS,
  evaluateRestrictions
};
