import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8001';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for stored token on app load
    console.log('🔍 AuthContext: Checking for stored token...');
    const storedToken = localStorage.getItem('chatbranch_token');
    if (storedToken) {
      console.log('🔑 AuthContext: Found stored token, verifying...');
      verifyToken(storedToken);
    } else {
      console.log('❌ AuthContext: No stored token found');
      setLoading(false);
    }
  }, []);

  const verifyToken = async (authToken: string) => {
    try {
      console.log('🔄 AuthContext: Verifying token with server...');
      const response = await axios.get(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log('✅ AuthContext: Token verified, user:', response.data);
      setUser(response.data);
      setToken(authToken);
      // Set default axios header for future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    } catch (error) {
      console.error('❌ AuthContext: Token verification failed:', error);
      localStorage.removeItem('chatbranch_token');
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      console.log('🏁 AuthContext: Verification complete, setting loading to false');
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        email,
        password
      });
      
      const { access_token, user: userData } = response.data;
      
      setToken(access_token);
      setUser(userData);
      
      // Store token for persistence (7 days)
      localStorage.setItem('chatbranch_token', access_token);
      
      // Set default axios header for future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      console.log('✅ Login successful:', userData);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('chatbranch_token');
    delete axios.defaults.headers.common['Authorization'];
  };

  const value: AuthContextType = useMemo(() => ({
    user,
    token,
    login,
    logout,
    loading,
    isAuthenticated: !!user && !!token
  }), [user, token, login, logout, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
