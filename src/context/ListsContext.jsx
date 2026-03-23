import { createContext, useContext, useState } from 'react';
import { getAllLists, saveList, resetList } from '../lib/listService';

const ListsContext = createContext(null);

export function ListsProvider({ children }) {
  const [lists, setLists] = useState(() => getAllLists());

  function updateList(key, items) {
    saveList(key, items);
    setLists(prev => ({ ...prev, [key]: items }));
  }

  function resetListKey(key) {
    const defaults = resetList(key);
    setLists(prev => ({ ...prev, [key]: defaults }));
  }

  return (
    <ListsContext.Provider value={{ lists, updateList, resetListKey }}>
      {children}
    </ListsContext.Provider>
  );
}

export function useLists() {
  const ctx = useContext(ListsContext);
  if (!ctx) throw new Error('useLists must be used within ListsProvider');
  return ctx;
}
