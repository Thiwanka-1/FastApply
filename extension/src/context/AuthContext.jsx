import { createContext, useState, useEffect } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Configure Axios to always send our HTTP-only cookie
  axios.defaults.withCredentials = true;
  const API_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    // Check if user is already logged in when the extension opens
    const checkUser = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/auth/profile`);
        setUser(data);
      } catch (error) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, [API_URL]);

  const login = async (email, password) => {
    const { data } = await axios.post(`${API_URL}/api/auth/login`, { email, password });
    setUser(data);
  };

  const register = async (name, email, password) => {
    const { data } = await axios.post(`${API_URL}/api/auth/register`, { name, email, password });
    setUser(data);
  };

  const logout = async () => {
    await axios.post(`${API_URL}/api/auth/logout`);
    setUser(null);
  };
  // Update Profile
  const updateProfile = async (userData) => {
    const { data } = await axios.put(`${API_URL}/api/auth/profile`, userData);
    setUser(data); // Update the global state with the new name/email
    return data;
  };

  // Delete Profile
  const deleteProfile = async () => {
    await axios.delete(`${API_URL}/api/auth/profile`);
    setUser(null); // Clear the global state
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout,updateProfile, deleteProfile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};