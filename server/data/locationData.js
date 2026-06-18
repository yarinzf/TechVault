'use strict';

/**
 * Static address reference data.
 * Structure: { [country]: { [city]: string[] } }
 * Consumed by the location controller — swap for a DB/external API lookup here
 * without touching any other layer.
 */
const ADDRESS_DATA = {
  Israel: {
    'Tel Aviv': [
      'Dizengoff', 'Allenby', 'Rothschild Blvd', 'Ben Yehuda',
      'Ibn Gabirol', 'Frishman', 'Gordon', 'HaYarkon', 'Herzl',
    ],
    Haifa: [
      'Herzl', 'Hagana', 'Moriah', 'HaNassi', 'Atzmaut',
      'HaCarmel', 'Sderot HaNassi',
    ],
    Jerusalem: [
      'Jaffa', 'King George', 'Ben Yehuda', 'Emek Refaim',
      'Hillel', 'Keren HaYesod', "HaNevi'im",
    ],
    'Beer Sheva': [
      'Rager', 'Ben Gurion', 'Herzl', 'HaAtzmaut', 'Shazar',
    ],
    'Rishon LeZion': [
      'Rothschild', 'Herzl', 'Jabotinsky', 'HaRishonim', 'Pasternak',
    ],
    Netanya: [
      'Herzl', 'HaAtzmaut', 'Szmidt', 'Dizengoff', 'Kikar HaAtzmaut',
    ],
    'Ramat Gan': [
      'Bialik', 'Jabotinsky', 'Begin', 'HaMasger', 'Krinitzi',
    ],
    'Petah Tikva': [
      'Herzl', 'Jabotinsky', 'Rothschild', 'HaHistadrut', 'Borochov',
    ],
  },
  'United States': {
    'New York': [
      'Broadway', '5th Avenue', 'Park Avenue', 'Lexington Ave',
      'Madison Ave', 'Wall Street', 'Canal Street',
    ],
    'Los Angeles': [
      'Sunset Blvd', 'Hollywood Blvd', 'Wilshire Blvd',
      'Venice Blvd', 'Melrose Ave', 'Rodeo Dr',
    ],
    Chicago: [
      'Michigan Ave', 'State Street', 'Lake Shore Dr',
      'Wacker Dr', 'Clark Street', 'Rush Street',
    ],
    Houston: [
      'Main Street', 'Westheimer Rd', 'Richmond Ave', 'Kirby Dr', 'Montrose Blvd',
    ],
    'San Francisco': [
      'Market Street', 'Mission Street', 'Haight Street',
      'Castro Street', 'Valencia Street', 'Fillmore Street',
    ],
  },
  Germany: {
    Berlin: [
      'Unter den Linden', 'Kurfürstendamm', 'Friedrichstraße',
      'Potsdamer Str', 'Prenzlauer Allee', 'Karl-Marx-Allee',
    ],
    Munich: [
      'Maximilianstraße', 'Leopoldstraße', 'Kaufingerstraße',
      'Ludwigstraße', 'Schleißheimer Straße',
    ],
    Hamburg: [
      'Reeperbahn', 'Mönckebergstraße', 'Jungfernstieg',
      'Eppendorfer Weg', 'Lange Reihe',
    ],
    Frankfurt: [
      'Zeil', 'Goethestraße', 'Kaiserstraße', 'Berger Straße', 'Sachsenhäuser Ufer',
    ],
    Cologne: [
      'Schildergasse', 'Hohe Straße', 'Ehrenstraße', 'Venloer Straße', 'Aachener Str',
    ],
  },
  'United Kingdom': {
    London: [
      'Oxford Street', 'Baker Street', "King's Road",
      'Portobello Road', 'Carnaby Street', 'Bond Street', 'Brick Lane',
    ],
    Manchester: [
      'Deansgate', 'Market Street', 'Oxford Road', 'Princess Street', 'Piccadilly',
    ],
    Birmingham: [
      'Broad Street', 'New Street', 'Colmore Row', 'Corporation Street', 'Hagley Road',
    ],
    Edinburgh: [
      'Royal Mile', 'Princes Street', 'George Street', 'Grassmarket', 'Leith Walk',
    ],
    Bristol: [
      'Clifton Down', 'Whiteladies Road', 'Park Street', 'Corn Street', 'Gloucester Road',
    ],
  },
};

const COUNTRIES = Object.keys(ADDRESS_DATA);

module.exports = { ADDRESS_DATA, COUNTRIES };
