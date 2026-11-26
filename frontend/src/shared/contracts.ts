import type { Bag, Listing, Home } from '../types';
export type IssuedBag = Bag & { pass_issued?: boolean };
export type BuyerListing = Omit<Listing, 'bags'> & { bags?: IssuedBag[] };
export type BuyerHomeData = Home & { recommended?: Listing[] };
