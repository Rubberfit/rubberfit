"use client";

import { useAuth } from "@/contexts/AuthContext";
import { AccountSwitcher } from "./account-switcher";

export function AccountSwitcherWrapper() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  // Convert auth user to the format expected by AccountSwitcher
  const users = [{
    id: user.id,
    name: user.name || user.email.split('@')[0],
    email: user.email,
    avatar: user.avatar || '',
    role: 'user'
  }];

  return <AccountSwitcher users={users} />;
}