import { createContext, useContext, useState, useEffect } from 'react';
import { fetchExchangeRate, formatCurrency } from '../lib/currency';

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => {
    return localStorage.getItem('cp_currency') || 'USD';
  });
  const [rate, setRate] = useState(3.7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExchangeRate().then(r => {
      setRate(r);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('cp_currency', currency);
  }, [currency]);

  function toggleCurrency() {
    setCurrency(c => c === 'USD' ? 'ILS' : 'USD');
  }

  function fmt(amount) {
    return formatCurrency(amount, currency, rate);
  }

  return (
    <CurrencyContext.Provider value={{ currency, rate, loading, toggleCurrency, fmt }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
