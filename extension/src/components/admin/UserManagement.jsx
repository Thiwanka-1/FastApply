import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Trash2, Shield, User, Loader2, AlertTriangle } from 'lucide-react';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  const API_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // FIXED: URL updated to match /api/auth/admin/users
        const { data } = await axios.get(`${API_URL}/api/auth/admin/users`, { withCredentials: true });
        setUsers(data);
      } catch (err) {
        setError('Failed to load user directory.');
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [API_URL]);

  const handleDeleteUser = async (id, role) => {
    if (role === 'admin') {
      alert("System Policy: Cannot delete another administrator account.");
      return;
    }
    
    if (!window.confirm("WARNING: This will permanently delete the user and all their profile data. Proceed?")) return;

    try {
      // FIXED: URL updated to match /api/auth/admin/users/:id
      await axios.delete(`${API_URL}/api/auth/admin/users/${id}`, { withCredentials: true });
      setUsers(users.filter(user => user._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete user.');
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-900/40 rounded-3xl border border-slate-800">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm">Loading directory...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 rounded-3xl overflow-hidden shadow-lg">
      
      <div className="p-6 border-b border-slate-700/50 bg-slate-900/80">
        <h2 className="text-xl font-bold text-white mb-4">System User Directory</h2>
        {error && <p className="text-red-400 text-sm mb-4 bg-red-500/10 p-3 rounded-lg flex items-center"><AlertTriangle className="w-4 h-4 mr-2"/> {error}</p>}
        
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-200 focus:outline-none focus:border-rose-500 transition-colors"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-black/20 text-slate-400 border-b border-slate-700/50">
              <th className="p-4 font-semibold text-sm">User Details</th>
              <th className="p-4 font-semibold text-sm">Clearance Level</th>
              <th className="p-4 font-semibold text-sm">System ID</th>
              <th className="p-4 font-semibold text-sm text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-8 text-center text-slate-500">No users found matching that criteria.</td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user._id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${user.role === 'admin' ? 'bg-rose-500/20 text-rose-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                        {user.role === 'admin' ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-bold text-slate-200">{user.name}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      user.role === 'admin' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <code className="text-xs text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                      {user._id.substring(0, 8)}...
                    </code>
                  </td>
                  <td className="p-4 text-right">
                    {user.role !== 'admin' && (
                      <button 
                        onClick={() => handleDeleteUser(user._id, user.role)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title="Delete User"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}