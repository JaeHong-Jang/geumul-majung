import { createContext, useContext } from 'react';

// 화면 간 이동: go('home'), go('order', { id: 3 }), back()
export const NavContext = createContext({
  current: 'login',
  params: {},
  go: () => {},
  back: () => {},
});

export const useNav = () => useContext(NavContext);
