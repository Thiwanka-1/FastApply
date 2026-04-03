import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import UserAnalytics from '../components/analytics/UserAnalytics';
import AdminAnalytics from '../components/analytics/AdminAnalytics';

export default function Analytics() {
  const { user } = useContext(AuthContext);

  // If the user's role is admin, render AdminAnalytics. Otherwise, render UserAnalytics.
  return user?.role === 'admin' ? <AdminAnalytics /> : <UserAnalytics />;
}