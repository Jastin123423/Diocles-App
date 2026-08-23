import React, { useState } from 'react';
import { Palette, KeyRound, Check, Lock, ShieldCheck, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SellerService } from '../../services/sellerService';
import { AuthService } from '../../services/authService';
import { SELLER_COLORS } from '../../utils/colors';

export const SellerSettings: React.FC = () => {
  const { currentUser, addToast, sellerColor, refreshUser } = useApp();

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);

  if (!currentUser) return null;

  const handleColorChange = (colorId: string) => {
    const res = SellerService.updateSellerColor(currentUser.id, colorId, currentUser);
    if (res.success) {
      refreshUser();
      addToast({
        type: 'success',
        title: 'Theme Color Updated',
        description: 'Your personal seller UI theme accent has been updated.',
      });
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }

    if (newPassword.length < 4) {
      setPasswordError('New password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password confirmation does not match.');
      return;
    }

    setIsChangingPass(true);
    const result = await AuthService.changePassword(
      currentUser.id,
      currentPassword,
      newPassword,
      currentUser
    );
    setIsChangingPass(false);

    if (result.success) {
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast({
        type: 'success',
        title: 'Password Changed',
        description: 'Your local seller login password was updated securely.',
      });
    } else {
      setPasswordError(result.error || 'Failed to update password.');
    }
  };

  return (
    <div id="seller-settings-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      <div className="mb-6 pb-4 border-b border-slate-800">
        <h2 className="text-xl font-bold text-white tracking-tight">Account Preferences</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Customize your seller profile appearance and manage local authentication
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Profile Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl text-white shadow-lg"
              style={{ backgroundColor: sellerColor.primary }}
            >
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{currentUser.name}</h3>
              <p className="text-xs text-slate-400">@{currentUser.username} • Active Seller Account</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                  Active
                </span>
                <span className="text-[10px] text-slate-500">Theme: {sellerColor.name}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Account Color Palette Picker (Requirement #7) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <Palette className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-bold text-white">Custom Seller Account Color</h3>
          </div>
          <p className="text-xs text-slate-400 mb-5 leading-relaxed">
            Choose your signature color palette. This color personalizes your buttons, active indicators, avatar badge, and POS register accents.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SELLER_COLORS.map(color => {
              const isSelected = (currentUser.color || 'blue') === color.id;

              return (
                <button
                  key={color.id}
                  id={`seller-color-${color.id}`}
                  onClick={() => handleColorChange(color.id)}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                    isSelected
                      ? 'bg-slate-850 border-white text-white ring-2 ring-blue-500/50 shadow-lg'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
                    style={{ backgroundColor: color.primary }}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                  <div className="truncate">
                    <span className="text-xs font-semibold block truncate">{color.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Change Password (Requirement #8) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Change Login Password</h3>
          </div>
          <p className="text-xs text-slate-400 mb-5">
            Update your local password for logging into this POS register.
          </p>

          {passwordError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {passwordError}
            </div>
          )}

          {passwordSuccess && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Password successfully changed and saved locally!</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 4 characters..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isChangingPass}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow transition disabled:opacity-50"
            >
              {isChangingPass ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
