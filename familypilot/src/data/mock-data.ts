import {
  CarFitResult,
  FamilyProfile,
  HolidayOffer,
  PackingItem,
  RecommendationSection,
  SavedItem,
  StoreLocation,
  Trip,
  Venue,
  VenueDetail,
  WeatherInfo,
} from '@/src/types';

const familyScore = (
  score: number,
  explanation: string[],
): { score: number; factors: Venue['familyScore']['factors']; explanation: string[] } => ({
  score,
  factors: {
    ageSuitability: score - 2,
    accessibility: score - 5,
    distance: score + 1,
    weatherFit: score - 3,
    budgetFit: score - 1,
    facilitiesMatch: score,
    popularity: score - 4,
  },
  explanation,
});

export const mockFamilyProfile: FamilyProfile = {
  id: 'family-1',
  parentName: 'Aidan',
  members: [
    { id: 'm1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'm2', name: 'Sloane', role: 'child', dateOfBirth: '2022-06-10', age: 4 },
    { id: 'm3', name: 'Ozzie', role: 'child', dateOfBirth: '2024-11-22', age: 1 },
  ],
  homeLocation: 'Bushey, Hertfordshire',
  budgetTier: 'moderate',
  maxDriveMinutes: 30,
  completionPercent: 72,
  vehicle: 'Tesla Model Y',
  pushchair: 'Bugaboo Butterfly',
  travelCot: null,
  memberships: ['National Trust'],
};

export const mockWeather: WeatherInfo = {
  condition: 'partly_cloudy',
  temperature: 18,
  description: 'Partly cloudy, perfect for outdoors',
};

export const mockVenues: Venue[] = [
  {
    id: 'venue-1',
    name: 'Aldenham Country Park',
    category: 'park',
    latitude: 51.657,
    longitude: -0.312,
    driveMinutes: 12,
    imageUrl: 'https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=800&q=80',
    familyScore: familyScore(98, [
      'Sloane is the perfect age for the adventure playground',
      'Flat enough for Ozzie\'s pushchair',
      'Only 12 minutes from home',
    ]),
    estimatedSpend: '£0 – £15',
    isOpen: true,
    address: ' Aldenham Rd, Elstree WD6 3BA',
  },
  {
    id: 'venue-2',
    name: 'Cassiobury Park',
    category: 'park',
    latitude: 51.655,
    longitude: -0.402,
    driveMinutes: 18,
    imageUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80',
    familyScore: familyScore(94, [
      'Great splash pad for hot days',
      'Large flat paths for pushchairs',
      'Free entry fits your budget',
    ]),
    estimatedSpend: 'Free',
    isOpen: true,
  },
  {
    id: 'venue-3',
    name: 'Willows Activity Farm',
    category: 'farm',
    latitude: 51.699,
    longitude: -0.412,
    driveMinutes: 22,
    imageUrl: 'https://images.unsplash.com/photo-1500595046743-be5264b89a46?w=800&q=80',
    familyScore: familyScore(91, [
      'Perfect for Sloane\'s age — feeding lambs',
      'Ozzie will love the tractor ride',
      'Indoor barn if it rains',
    ]),
    estimatedSpend: '£35 – £50',
    isOpen: true,
  },
  {
    id: 'venue-4',
    name: 'Science Museum',
    category: 'museum',
    latitude: 51.497,
    longitude: -0.176,
    driveMinutes: 35,
    imageUrl: 'https://images.unsplash.com/photo-1530986600824-0b6060a851a2?w=800&q=80',
    familyScore: familyScore(88, [
      'Brilliant rainy day option',
      'Free entry, fits your budget',
      'Interactive exhibits for Sloane',
    ]),
    estimatedSpend: 'Free',
    isOpen: true,
  },
  {
    id: 'venue-5',
    name: 'The Farmhouse Cafe',
    category: 'restaurant',
    latitude: 51.658,
    longitude: -0.31,
    driveMinutes: 13,
    imageUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80',
    familyScore: familyScore(92, [
      'Highchairs and kids menu available',
      'Baby changing in the café',
      'Near Aldenham Park',
    ]),
    estimatedSpend: '£30 – £45',
    isOpen: true,
  },
];

export const mockVenueDetails: Record<string, VenueDetail> = Object.fromEntries(
  mockVenues.map((venue) => [
    venue.id,
    {
      ...venue,
      photos: [
        venue.imageUrl.replace('w=800', 'w=1200'),
        venue.imageUrl.replace('w=800', 'w=1200').replace('q=80', 'q=70'),
      ],
      facilities: getDefaultFacilities(venue.category),
      openingHours: 'Estimated · Usually 8:00 AM – 6:00 PM',
      terrain: venue.category === 'park' || venue.category === 'farm' ? 'flat' : 'mixed',
      bestAges: venue.category === 'museum' ? '3 – 12 years' : '1 – 8 years',
      parkingInfo: venue.category === 'restaurant' ? 'Street parking nearby' : 'Free parking available',
      description: getDefaultDescription(venue),
      visitDurationMinutes: venue.category === 'restaurant' ? 90 : 180,
      warnings:
        venue.category === 'park'
          ? ['Playground busiest 11am–2pm on weekends']
          : undefined,
      communityTips:
        venue.id === 'venue-1'
          ? [
              {
                id: 'tip-1',
                author: 'Sarah M.',
                message: 'Café queue is shorter before 11:30. Baby changing is behind the counter.',
                timeAgo: '2 days ago',
              },
              {
                id: 'tip-2',
                author: 'James T.',
                message: 'Parking fills up fast — arrive by 9:30 for a stress-free start.',
                timeAgo: '1 week ago',
              },
            ]
          : [
              {
                id: `tip-${venue.id}`,
                author: 'Parent community',
                message: 'Prototype venue data — community tips coming soon.',
                timeAgo: 'Recently',
              },
            ],
    } satisfies VenueDetail,
  ]),
);

function getDefaultFacilities(category: Venue['category']): VenueDetail['facilities'] {
  const base: VenueDetail['facilities'] = ['toilets', 'parking'];
  switch (category) {
    case 'park':
      return [...base, 'playground', 'cafe', 'baby_changing', 'picnic', 'pushchair_friendly', 'shade'];
    case 'farm':
      return [...base, 'cafe', 'baby_changing', 'playground', 'pushchair_friendly'];
    case 'museum':
      return [...base, 'cafe', 'baby_changing', 'pushchair_friendly'];
    case 'restaurant':
      return [...base, 'highchairs', 'baby_changing'];
    default:
      return base;
  }
}

function getDefaultDescription(venue: Venue): string {
  switch (venue.category) {
    case 'park':
      return `${venue.name} is a family-friendly outdoor space with paths, play areas, and room to explore. Prototype venue data.`;
    case 'farm':
      return `${venue.name} offers hands-on animal experiences and indoor barns — great for young children. Prototype venue data.`;
    case 'museum':
      return `${venue.name} is a rainy-day favourite with interactive exhibits for curious kids. Prototype venue data.`;
    case 'restaurant':
      return `${venue.name} welcomes families with highchairs, changing facilities, and a relaxed atmosphere. Prototype venue data.`;
    default:
      return `${venue.name} — prototype venue data for user testing.`;
  }
}

export const mockRecentVenues: Venue[] = [mockVenues[0], mockVenues[4]];

export const mockRecommendations: RecommendationSection[] = [
  {
    id: 'rec-1',
    title: 'Recommended for your family',
    subtitle: 'Based on Sloane & Ozzie\'s ages, today\'s weather, and your location',
    venues: mockVenues.slice(0, 3),
  },
  {
    id: 'rec-2',
    title: 'Weekend ideas',
    subtitle: 'Popular with families like yours',
    venues: [mockVenues[2], mockVenues[0], mockVenues[4]],
  },
  {
    id: 'rec-3',
    title: 'Rainy day ideas',
    subtitle: 'Indoor options within 30 minutes',
    venues: [mockVenues[3], mockVenues[2]],
  },
];

export const mockTrips: Trip[] = [
  {
    id: 'trip-1',
    title: 'Saturday Adventure',
    date: 'Saturday, 9 Aug',
    totalDriveMinutes: 40,
    estimatedCost: '£30 – £45',
    totalDurationHours: 6,
    stops: [
      {
        id: 's1',
        time: '9:30 AM',
        title: 'Aldenham Country Park',
        subtitle: '12 min drive · Free parking',
        imageUrl: mockVenues[0].imageUrl,
        type: 'venue',
      },
      {
        id: 's2',
        time: '12:30 PM',
        title: 'The Farmhouse Cafe',
        subtitle: 'Lunch · Highchairs available',
        imageUrl: mockVenues[4].imageUrl,
        type: 'meal',
      },
      {
        id: 's3',
        time: '3:30 PM',
        title: 'Home',
        subtitle: '28 min drive',
        imageUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&q=80',
        type: 'home',
      },
    ],
  },
];

export const mockSavedItems: SavedItem[] = [
  { id: 'saved-1', type: 'place', venue: mockVenues[0] },
  { id: 'saved-2', type: 'restaurant', venue: mockVenues[4] },
  { id: 'saved-3', type: 'place', venue: mockVenues[1] },
];

export const mockStores: StoreLocation[] = [
  {
    id: 'store-1',
    name: "Sainsbury's Bushey",
    brand: 'sainsburys',
    driveMinutes: 5,
    isOpen: true,
    closesAt: '10:00 PM',
    phone: '020 8950 1234',
    categoriesAvailable: ['Formula', 'Nappies', 'Wipes', 'Baby food'],
    stockNotes: ['Usually stocks Aptamil and baby essentials'],
  },
  {
    id: 'store-2',
    name: 'Boots Watford',
    brand: 'boots',
    driveMinutes: 8,
    isOpen: true,
    closesAt: '8:00 PM',
    phone: '01923 123456',
    categoriesAvailable: ['Medicine', 'Calpol', 'Thermometers'],
    stockNotes: ['Usually stocks Calpol and thermometers'],
  },
  {
    id: 'store-3',
    name: 'ALDI Bushey',
    brand: 'aldi',
    driveMinutes: 6,
    isOpen: true,
    closesAt: '9:00 PM',
    categoriesAvailable: ['Baby food', 'Formula', 'Nappies'],
    stockNotes: ['Usually stocks baby food and formula'],
  },
];

export const mockCarFit: CarFitResult = {
  carName: 'Tesla Model Y',
  bootCapacityLitres: 854,
  equipment: [
    { id: 'e1', name: 'Doona car seat', volumeLitres: 45, fits: true },
    { id: 'e2', name: 'Bugaboo Butterfly', volumeLitres: 85, fits: true },
    { id: 'e3', name: 'Large suitcase × 2', volumeLitres: 280, fits: true },
    { id: 'e4', name: 'Medium suitcase × 2', volumeLitres: 200, fits: true },
    { id: 'e5', name: 'Travel cot', volumeLitres: 60, fits: true },
  ],
  allFits: true,
  spareLitres: 184,
};

export const mockPackingItems: PackingItem[] = [
  { id: 'p1', category: 'Essentials', name: 'Large suitcases', quantity: 2, packed: true },
  { id: 'p2', category: 'Essentials', name: 'Travel documents', quantity: 1, packed: true },
  { id: 'p3', category: 'Baby', name: 'Bugaboo Butterfly', quantity: 1, packed: false },
  { id: 'p4', category: 'Baby', name: 'Nappies (3 days)', quantity: 24, packed: false },
  { id: 'p5', category: 'Baby', name: 'Aptamil formula', quantity: 2, packed: false },
  { id: 'p6', category: 'Kids', name: 'Swimming gear', quantity: 2, packed: false },
  { id: 'p7', category: 'Kids', name: 'Sun hats', quantity: 2, packed: true },
  { id: 'p8', category: 'Toiletries', name: 'Sun cream SPF50', quantity: 2, packed: false },
  { id: 'p9', category: 'Toiletries', name: 'Calpol & thermometer', quantity: 1, packed: true },
];

export const mockHolidayOffers: HolidayOffer[] = [
  {
    id: 'h1',
    provider: 'jet2',
    hotelName: 'Bahia Principe Sunlight',
    imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80',
    price: 2840,
    familyScore: familyScore(96, ['Includes luggage', 'Short transfer (25 min)', 'Kids club for Sloane\'s age']),
    highlights: ['Includes 22kg luggage', '25 min transfer', 'All-inclusive'],
    recommended: true,
  },
  {
    id: 'h2',
    provider: 'tui',
    hotelName: 'Bahia Principe Sunlight',
    imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80',
    price: 2760,
    familyScore: familyScore(91, ['£80 cheaper', 'Room upgrade available']),
    highlights: ['Lowest price', 'Free room upgrade', 'All-inclusive'],
  },
  {
    id: 'h3',
    provider: 'loveholidays',
    hotelName: 'Bahia Principe Sunlight',
    imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80',
    price: 2890,
    familyScore: familyScore(88, ['Flexible payment', 'ATOL protected']),
    highlights: ['Pay in instalments', 'ATOL protected'],
  },
];
