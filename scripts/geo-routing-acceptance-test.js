const assert = require('assert');

function distanceKm(a, b) {
  const toRad = (value) => value * Math.PI / 180;
  const radius = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function chooseTechnician(ticket, technicians) {
  const requiredSkill = String(ticket.complaintCategory || ticket.trade || '').toLowerCase();
  return technicians
    .filter((tech) => {
      const onDuty = tech.onDuty === true || tech.available === true || tech.isOffDuty === false;
      const hasCapacity = Number(tech.currentJobCount || 0) < Number(tech.maxConcurrentJobs || 3);
      const emiratesCovered = Array.isArray(tech.emiratesCovered) ? tech.emiratesCovered : [tech.emirate].filter(Boolean);
      const sameEmirate = emiratesCovered.map((e) => String(e).toLowerCase()).includes(String(ticket.emirate).toLowerCase());
      const skills = Array.isArray(tech.tradeSkills) ? tech.tradeSkills.map((s) => String(s).toLowerCase()) : [String(tech.trade || tech.specialization || '').toLowerCase()];
      const skillMatch = !requiredSkill || skills.some((skill) => requiredSkill.includes(skill) || skill.includes(requiredSkill));
      return onDuty && hasCapacity && sameEmirate && skillMatch;
    })
    .map((tech) => {
      const citiesCovered = Array.isArray(tech.citiesCovered) ? tech.citiesCovered.map((c) => String(c).toLowerCase()) : [];
      const sameCity = citiesCovered.includes(String(ticket.city).toLowerCase()) || String(tech.currentDutyArea || tech.primaryArea || '').toLowerCase() === String(ticket.city).toLowerCase();
      const sameArea = String(tech.currentDutyArea || tech.primaryArea || '').toLowerCase() === String(ticket.area).toLowerCase();
      return {
        ...tech,
        sameCity,
        sameArea,
        distance: tech.liveLocation ? distanceKm(tech.liveLocation, ticket.geo) : Number.POSITIVE_INFINITY,
        jobCount: Number(tech.currentJobCount || 0),
        rating: Number(tech.rating || 0)
      };
    })
    .sort((a, b) => Number(b.sameArea) - Number(a.sameArea) || Number(b.sameCity) - Number(a.sameCity) || a.distance - b.distance || a.jobCount - b.jobCount || b.rating - a.rating)[0] || null;
}

const technicians = [
  {
    id: 'techA',
    emirate: 'Abu Dhabi',
    citiesCovered: ['Al Ain'],
    primaryArea: 'Al Jimi',
    tradeSkills: ['AC', 'plumbing'],
    onDuty: true,
    available: true,
    currentJobCount: 0,
    maxConcurrentJobs: 3,
    rating: 4.7,
    liveLocation: { lat: 24.2522, lng: 55.7287 }
  },
  {
    id: 'techB',
    emirate: 'Dubai',
    citiesCovered: ['Dubai'],
    primaryArea: 'Business Bay',
    tradeSkills: ['AC', 'electrical'],
    onDuty: true,
    available: true,
    currentJobCount: 0,
    maxConcurrentJobs: 3,
    rating: 4.6,
    liveLocation: { lat: 25.1850, lng: 55.2728 }
  },
  {
    id: 'techC',
    emirate: 'Abu Dhabi',
    citiesCovered: ['Abu Dhabi'],
    primaryArea: 'Al Reem',
    tradeSkills: ['AC'],
    onDuty: true,
    available: true,
    currentJobCount: 0,
    maxConcurrentJobs: 3,
    rating: 4.8,
    liveLocation: { lat: 24.4936, lng: 54.4071 }
  }
];

const cases = [
  {
    name: 'Al Ain AC assigns Technician A',
    ticket: { emirate: 'Abu Dhabi', city: 'Al Ain', area: 'Al Jimi', complaintCategory: 'AC', geo: { lat: 24.2522, lng: 55.7287 } },
    expected: 'techA'
  },
  {
    name: 'Dubai AC assigns Technician B',
    ticket: { emirate: 'Dubai', city: 'Dubai', area: 'Business Bay', complaintCategory: 'AC', geo: { lat: 25.1850, lng: 55.2728 } },
    expected: 'techB'
  },
  {
    name: 'Abu Dhabi city AC assigns Technician C',
    ticket: { emirate: 'Abu Dhabi', city: 'Abu Dhabi', area: 'Al Reem', complaintCategory: 'AC', geo: { lat: 24.4936, lng: 54.4071 } },
    expected: 'techC'
  },
  {
    name: 'Al Ain pest does not assign AC-only technician',
    ticket: { emirate: 'Abu Dhabi', city: 'Al Ain', area: 'Al Jimi', complaintCategory: 'pest', geo: { lat: 24.2522, lng: 55.7287 } },
    expected: null
  }
];

for (const testCase of cases) {
  const assigned = chooseTechnician(testCase.ticket, technicians);
  assert.strictEqual(assigned ? assigned.id : null, testCase.expected, testCase.name);
  console.log(`PASS: ${testCase.name} -> ${assigned ? assigned.id : 'admin escalation'}`);
}
