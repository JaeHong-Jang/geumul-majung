/** 판매자 사진이 없을 때 매물 상세에 보이는 품목별 예시 사진. 같은 품목이라도 매물(회사)마다 다른 사진이 나오도록 여러 장.
 * 모두 자유 이용 허락(CC) 또는 공공 영역 사진이고, 화면에 작성자, 출처, 라이선스를 함께 보인다. 목록은 public/photos/CREDITS.md. */
export interface ExamplePhoto { src: string; title: string; artist: string; license: string; licenseUrl: string; page: string; source: string }
const PHOTOS: Record<string, ExamplePhoto[]> = {
  "pp": [
    {"src": "/photos/pp_1.jpg", "title": "Sacks of plastic granules.jpg", "artist": "Rohini", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/", "page": "https://commons.wikimedia.org/wiki/File:Sacks_of_plastic_granules.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/pp_2.jpg", "title": "Pre-production plastic pellets", "artist": "NOAA Marine Debris Program", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/78725676@N06/7656726070", "source": "Flickr"},
    {"src": "/photos/pp_3.jpg", "title": "Just start with plastic pellets...", "artist": "PICNIC Network", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/", "page": "https://www.flickr.com/photos/30196297@N07/8022943590", "source": "Flickr"},
    {"src": "/photos/pp_4.jpg", "title": "Pellets", "artist": "oskay", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/17425845@N00/1406396267", "source": "Flickr"},
    {"src": "/photos/pp_5.jpg", "title": "Plastic pellets", "artist": "Plusea", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/64586501@N00/33900539113", "source": "Flickr"},
    {"src": "/photos/pp_6.jpg", "title": "Uncolored plastic granules.jpg", "artist": "Rohini", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/", "page": "https://commons.wikimedia.org/wiki/File:Uncolored_plastic_granules.jpg", "source": "Wikimedia Commons"},
  ],
  "pe": [
    {"src": "/photos/pe_1.jpg", "title": "Clean-HDPE-drum-flakes.jpg", "artist": "Soddaa", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "page": "https://commons.wikimedia.org/wiki/File:Clean-HDPE-drum-flakes.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/pe_2.jpg", "title": "High-Density-Polyethylene-Pipes_Black-HDPE-pipes__IMG_3404-580x386", "artist": "Public Domain Photos", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/28958738@N06/8454803367", "source": "Flickr"},
    {"src": "/photos/pe_3.jpg", "title": "0406102154.jpg", "artist": "steevithak", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/", "page": "https://www.flickr.com/photos/8386148@N06/4498397389", "source": "Flickr"},
    {"src": "/photos/pe_4.jpg", "title": "hope", "artist": "lincoln-log", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/65553294@N00/2536593722", "source": "Flickr"},
  ],
  "pet": [
    {"src": "/photos/pet_1.jpg", "title": "Baled PET Bottles in Taiwan.jpg", "artist": "Larry Koester", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://commons.wikimedia.org/wiki/File:Baled_PET_Bottles_in_Taiwan.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/pet_2.jpg", "title": "Bales of PET bottles.jpg", "artist": "Michal Maňas", "license": "CC BY 3.0", "licenseUrl": "https://creativecommons.org/licenses/by/3.0/", "page": "https://commons.wikimedia.org/wiki/File:Bales_of_PET_bottles.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/pet_3.jpg", "title": "Baled PET Bottles in Storage (2)", "artist": "larrywkoester", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/126110866@N08/23638818849", "source": "Flickr"},
    {"src": "/photos/pet_4.jpg", "title": "Baled PET Bottles in Storage (3)", "artist": "larrywkoester", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/126110866@N08/23378460094", "source": "Flickr"},
    {"src": "/photos/pet_5.jpg", "title": "Baled PET Bottles in Storage", "artist": "larrywkoester", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/126110866@N08/23924133371", "source": "Flickr"},
  ],
  "abs": [
    {"src": "/photos/abs_1.jpg", "title": "Pellets of reclycle ABS.jpg", "artist": "Amandaprc", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "page": "https://commons.wikimedia.org/wiki/File:Pellets_of_reclycle_ABS.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/abs_2.jpg", "title": "Pellet azul.jpg", "artist": "ISIPLAST S.A de C.V", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "page": "https://commons.wikimedia.org/wiki/File:Pellet_azul.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/abs_3.jpg", "title": "Plastic recycling process.jpg", "artist": "Kaisha33", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "page": "https://commons.wikimedia.org/wiki/File:Plastic_recycling_process.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/abs_4.jpg", "title": "24-01-13 04 Plastic Pellets Wash up in Spain", "artist": "Felton Davis", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/106368363@N02/53461353571", "source": "Flickr"},
  ],
  "철": [
    {"src": "/photos/iron_1.jpg", "title": "CompactedSteelScraps.jpg", "artist": "Rotor DB", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/", "page": "https://commons.wikimedia.org/wiki/File:CompactedSteelScraps.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/iron_2.jpg", "title": "SCRAPPED AUTO BODIES COMPRESSED INTO CUBES WILL BE SHIPPED TO STEEL MILLS AND RECYCLED. VICINITY OF 28TH AVENUE NORTH... - NARA - 551517.jpg", "artist": "Donald Emmerich", "license": "Public domain", "licenseUrl": "https://commons.wikimedia.org/wiki/Commons:Licensing", "page": "https://commons.wikimedia.org/wiki/File:SCRAPPED_AUTO_BODIES_COMPRESSED_INTO_CUBES_WILL_BE_SHIPPED_TO_STEEL_MILLS_AND_RECYCLED._VICINITY_OF_28TH_AVENUE_NORTH..._-_NARA_-_551517.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/iron_3.jpg", "title": "Wrecking Yard, More Scrap Metal", "artist": "Consumerist Dot Com", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/21241181@N00/843582186", "source": "Flickr"},
    {"src": "/photos/iron_4.jpg", "title": "demolition scrap metal", "artist": "jared", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/35468148654@N01/9022357032", "source": "Flickr"},
    {"src": "/photos/iron_5.jpg", "title": "Wrecking Yard, Scrap Metal", "artist": "Consumerist Dot Com", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/21241181@N00/843579868", "source": "Flickr"},
    {"src": "/photos/iron_6.jpg", "title": "Scrap metal", "artist": "barbourians", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/", "page": "https://www.flickr.com/photos/51607907@N03/7334966470", "source": "Flickr"},
    {"src": "/photos/iron_7.jpg", "title": "Scrap Metal", "artist": "daveparker", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/92155448@N00/28352564", "source": "Flickr"},
  ],
  "알루미늄": [
    {"src": "/photos/aluminum_1.jpg", "title": "Cans... (32952295076).jpg", "artist": "Scott Macpherson", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/", "page": "https://commons.wikimedia.org/wiki/File:Cans..._(32952295076).jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/aluminum_2.jpg", "title": "Aluminum Cans", "artist": "chidorian", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/", "page": "https://www.flickr.com/photos/21518596@N00/3613515017", "source": "Flickr"},
    {"src": "/photos/aluminum_3.jpg", "title": "Aluminum Cans Recycling Sign", "artist": "Alabama Extension", "license": "CC0", "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/", "page": "https://www.flickr.com/photos/184594136@N08/52325019553", "source": "Flickr"},
    {"src": "/photos/aluminum_4.jpg", "title": "Six-pack yoke", "artist": "Ruth and Dave", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/95142644@N00/2291585398", "source": "Flickr"},
    {"src": "/photos/aluminum_5.jpg", "title": "Camp Pendleton's occupants recycle more than 22,000 aluminum cans every three weeks.jpg", "artist": "작성자 미상", "license": "Public domain", "licenseUrl": "https://commons.wikimedia.org/wiki/Commons:Licensing", "page": "https://commons.wikimedia.org/wiki/File:Camp_Pendleton%27s_occupants_recycle_more_than_22,000_aluminum_cans_every_three_weeks.jpg", "source": "Wikimedia Commons"},
  ],
  "구리": [
    {"src": "/photos/copper_1.jpg", "title": "copper scraps", "artist": "Inha Leex Hale", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/46835425@N00/3510927258", "source": "Flickr"},
    {"src": "/photos/copper_2.jpg", "title": "Scrap Tubing_3623", "artist": "Barta IV", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/98640399@N08/11376881036", "source": "Flickr"},
    {"src": "/photos/copper_3.jpg", "title": "Artsy Farsty in Reno", "artist": "Darron Birgenheier", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/", "page": "https://www.flickr.com/photos/28502132@N05/9048157996", "source": "Flickr"},
    {"src": "/photos/copper_4.jpg", "title": "Scrap Heavy Coax_3625", "artist": "Barta IV", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/98640399@N08/11376895666", "source": "Flickr"},
    {"src": "/photos/copper_5.jpg", "title": "Copper wire, 1 mm thick, 5.5 cm long.jpg", "artist": "Hi-Res Images of Chemical Elements", "license": "CC BY 3.0", "licenseUrl": "https://creativecommons.org/licenses/by/3.0/", "page": "https://commons.wikimedia.org/wiki/File:Copper_wire,_1_mm_thick,_5.5_cm_long.jpg", "source": "Wikimedia Commons"},
  ],
  "골판지": [
    {"src": "/photos/cardboard_1.jpg", "title": "Baal door Balenpers.jpg", "artist": "Romy2702", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/", "page": "https://commons.wikimedia.org/wiki/File:Baal_door_Balenpers.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/cardboard_2.jpg", "title": "Recycling center operations 110804-F-VJ113-084.jpg", "artist": "Airman 1st Class Hayden Hyatt", "license": "Public domain", "licenseUrl": "https://commons.wikimedia.org/wiki/Commons:Licensing", "page": "https://commons.wikimedia.org/wiki/File:Recycling_center_operations_110804-F-VJ113-084.jpg", "source": "Wikimedia Commons"},
    {"src": "/photos/cardboard_3.jpg", "title": "How Walmart recycles cardboard", "artist": "Walmart Corporate", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/50128414@N05/5326823035", "source": "Flickr"},
    {"src": "/photos/cardboard_4.jpg", "title": "Walmart Central America recycling", "artist": "Walmart Corporate", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/50128414@N05/5515312619", "source": "Flickr"},
    {"src": "/photos/cardboard_5.jpg", "title": "Walmart Central America recycling", "artist": "Walmart Corporate", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/50128414@N05/5515312449", "source": "Flickr"},
    {"src": "/photos/cardboard_6.jpg", "title": "Baled cardboard at Mastagard", "artist": "siftnz", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/34640694@N08/4661008613", "source": "Flickr"},
    {"src": "/photos/cardboard_7.jpg", "title": "Becon Dry Waste RMF baled cardboard", "artist": "siftnz", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "page": "https://www.flickr.com/photos/34640694@N08/4680702400", "source": "Flickr"},
  ],
};
/** 품목의 n번째 예시 사진(사진 수보다 매물이 많으면 다시 처음부터). */
export const examplePhoto = (key: string, n = 0): ExamplePhoto | undefined => {
  const list = PHOTOS[key.toLowerCase()];
  return list?.length ? list[((n % list.length) + list.length) % list.length] : undefined;
};
