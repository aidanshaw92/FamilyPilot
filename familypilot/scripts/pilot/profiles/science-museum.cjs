module.exports = {
  id: 'fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE', name: 'Science Museum', category: 'museum', site: 'sciencemuseum.org.uk',
  facts: [
    // --- what children can do
    { sec: 'activities', key: 'the-garden', kind: 'provision', ages: [36, 84], label: 'The Garden: hands-on water, light, sound and construction play, for 3 to 6',
      t: 'The Garden is a hands-on play gallery for 3 to 6 year olds.', u: '/visit/young-explorers-guide-science-museum',
      q: 'check out one of our family favourites and a must-visit for 3–6-year-olds, The Garden' },
    { sec: 'activities', key: 'bubble-explorers', kind: 'programme', ages: [0, 96], label: 'Bubble Explorers live show, for children 7 and under',
      t: 'Bubble Explorers is a live bubbles show for children 7 and under, at weekends and daily in school holidays (£4.50; free for 2 and under).', u: '/visit/young-explorers-guide-science-museum',
      q: 'Perfect for children aged 7 and under, Bubble Explorer s takes place on weekends and every day during school holidays.' },
    { sec: 'activities', key: 'wonderlab', kind: 'provision', ages: [84, 180], label: 'Wonderlab: interactive science gallery, for 7 to 14',
      t: 'Wonderlab is the interactive gallery for children 7 to 14 (a paid gallery).', u: '/visit/space-lovers-guide-science-museum',
      q: 'Visit Wonderlab (level 3), our interactive gallery for children aged 7-14' },
    { sec: 'activities', key: 'pattern-pod', st: 'hypothesis', t: 'Pattern Pod (free multi-sensory play) probably suits under-7s.',
      n: 'The page describes Pattern Pod with no age. It appears as a stop on a guide "for families with children under seven", which is the guide\'s audience, not a statement about the gallery.',
      u: '/visit/young-explorers-guide-science-museum', q: 'This free multi-sensory area allows children to play with water ripples without getting their feet wet' },
    // --- pushchair and baby
    { sec: 'pushchair', key: 'storage', v: 'yes', t: 'Free buggy parking in the Spare Room (level -1, opposite The Garden); a small free buggy park by Pattern Pod.', u: '/visit/space-lovers-guide-science-museum',
      q: 'Buggy parking is available free of charge in the Spare Room, located opposite The Garden gallery on level -1.' },
    { sec: 'pushchair', key: 'allowed', v: 'yes', t: 'Buggies are allowed in the galleries, but bulky ones may be sent to a buggy park in some areas.', u: '/visit/young-explorers-guide-science-museum',
      q: 'Buggies are allowed in the museum and galleries. However, in certain areas, you may be asked to leave your pram in a buggy park' },
    // --- toilets
    { sec: 'toilets', key: 'babyChanging', v: 'yes', t: 'Baby changing on every floor.', u: '/visit/young-explorers-guide-science-museum',
      q: 'Baby changing facilities are located throughout all floors of the museum.' },
    { sec: 'toilets', key: 'accessibleToilet', v: 'yes', t: 'Accessible toilets on every level.', u: '/visit/accessibility',
      q: 'Accessible toilets are available on all levels of the museum.' },
    { sec: 'toilets', key: 'changingPlaces', v: 'yes', t: 'A Changing Places toilet on level 0 (the page also carries a notice about works on 14 to 25 September).', u: '/visit/accessibility',
      q: 'Please note the Changing Places toilet will be unavailable between 14 Sept – 25 Sept due to planned building works.', conflict: 'a notice dated 14 to 25 September, already past on the reading date' },
    // --- getting there
    { sec: 'transport', key: 'blueBadge', v: 'yes', t: 'A small number of accessible parking spaces on Exhibition Road.', u: '/visit/accessibility',
      q: 'A small number of accessible parking spaces are available on Exhibition Road.' },
    { sec: 'transport', key: 'station', st: 'unknown', t: 'Nearest station and bus routes: the pages read did not say.', n: 'The "Getting here" page was linked but not among the pages read.', gap: { venue: 'Science Museum', anchor: 'Getting here' } },
    { sec: 'transport', key: 'parking', st: 'unknown', t: 'General car parking: not stated on the pages read.', n: 'Only accessible spaces are mentioned.', gap: { venue: 'Science Museum', anchor: 'Getting here' } },
    // --- food
    { sec: 'food', key: 'cafe', v: 'yes', t: 'Three cafés and a milkshake and ice cream bar.', u: '/visit/food-and-drink',
      q: 'There are lots of food and drink options at the Science Museum: We have three cafés, a milkshake/ice cream bar and picnic areas.' },
    { sec: 'food', key: 'picnic', v: 'yes', t: 'Bring your own food: dedicated picnic areas on levels -1, 2 and 3.', u: '/visit/food-and-drink',
      q: 'You are welcome to bring your own food and drink, which you can enjoy in one of our dedicated picnic areas' },
    // --- play
    { sec: 'play', key: 'playground', st: 'unknown', t: 'No outdoor playground: not applicable to this venue; indoor play is The Garden and Pattern Pod.', n: 'Not an expected facility for a museum; shown only through the activities above.' },
    // --- access
    { sec: 'access', key: 'stepFreeRoute', v: 'yes', t: 'A step-free route for families with under-7s links the toddler galleries.', u: '/visit/young-explorers-guide-science-museum',
      q: 'this free guide can be enjoyed at your own pace and follows a step-free route through the museum' },
    { sec: 'access', key: 'mezzanine', v: 'no', scope: 'area', t: 'No step-free access to the mezzanine in Making the Modern World and Flight.', u: '/visit/accessibility',
      q: 'There is currently no step-free access to the mezzanine level in Making the Modern World and Flight galleries.' },
    { sec: 'access', key: 'wheelchairLoan', v: 'yes', t: 'Wheelchairs and folding stools can be borrowed from the Information Desk.', u: '/visit/accessibility',
      q: 'You can also borrow a wheelchair or folding stool on the day by asking a member of staff at the Information Desk.' },
    // --- opening
    { sec: 'opening', key: 'hours', v: '10:00-18:00 daily', t: 'Open daily 10:00 to 18:00; closed 24 to 26 December.', u: '/visit',
      q: 'The museum is open daily from 10.00–18.00 (except for 24–26 December when the museum is closed).' },
    // --- pricing
    { sec: 'pricing', key: 'free', v: 'free', t: 'Free admission with a pre-booked ticket. Wonderlab, Power Up, IMAX and the Bubble Explorers show are charged.', u: '/',
      q: 'Book your free ticket today and discover a universe of experiences at the Science Museum.' },
    { sec: 'pricing', key: 'bubbleExplorers', v: '£4.50', t: 'Bubble Explorers: £4.50 per person, free for children 2 and under.', u: '/visit/young-explorers-guide-science-museum',
      q: 'Tickets are £4.50 per person with free entry for children aged 2 and under.' },
    // --- considerations
    { sec: 'considerations', key: 'duration', v: 120, t: 'A typical visit lasts about two hours.', u: '/visit',
      q: 'You are welcome to stay in the museum as long as you like, but an average visit lasts around two hours.' },
    { sec: 'considerations', key: 'supervision', v: 'under 12 with an adult', t: 'Children under 12 must be with an adult aged 18 or over.', u: '/visit',
      q: 'Children under 12 must be accompanied by an adult (aged 18+).' },
    { sec: 'considerations', key: 'building-noise', v: 'noise', t: 'New galleries are being built, so there may be some extra noise.', u: '/visit/accessibility',
      q: "We're currently building new galleries in the museum so there may be some additional noise during your visit." },
  ],
};
