import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Types 
export type AppRole =
  | "admin"
  | "cutter"
  | "manager"
  | "member"
  | "supervisor"
  | "viewer";

// Permission → roles that can perform it 
// ANY match: user needs at least one of the listed roles.
export const PERMISSIONS = {
  // Cut Planner page access
  accessCutPlanner:   ["admin", "cutter", "manager", "supervisor"] as AppRole[],
  // Create a cut / confirm cut dialog
  createCut:          ["admin", "cutter"]                          as AppRole[],
  // Access batch cut mode
  accessBatchCut:     ["admin", "cutter"]                          as AppRole[],
  // Approve a cut before execution
  approveCut:         ["admin", "supervisor"]                      as AppRole[],
  // View inventory page
  viewInventory:      ["admin", "cutter", "manager", "supervisor", "member", "viewer"] as AppRole[],
  // Add, edit, delete rolls
  manageRolls:        ["admin", "manager"]                         as AppRole[],
  // Manage users and their roles
  manageUsers:        ["admin"]                                    as AppRole[],
  // View reports & analytics
  viewReports:        ["admin", "manager", "supervisor"]           as AppRole[],
} as const;

export type Permission = keyof typeof PERMISSIONS;

// Hook return type 
export interface UseRoleReturn {
  roles:     AppRole[];           // all roles the user holds
  isLoading: boolean;
  userId:    string | null;
  email:     string | null;
  fullName:  string | null;
  // Convenience role checks
  isAdmin:      boolean;
  isCutter:     boolean;
  isManager:    boolean;
  isSupervisor: boolean;
  isMember:     boolean;
  isViewer:     boolean;
  // Permission checker — returns true if user has ANY role for that action
  can: (permission: Permission) => boolean;
  // Check a custom list of roles on the fly
  hasAnyRole: (required: AppRole[]) => boolean;
}

// Hook 
export function useRole(): UseRoleReturn {
  const [roles,    setRoles]    = useState<AppRole[]>([]);
  const [userId,   setUserId]   = useState<string | null>(null);
  const [email,    setEmail]    = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [isLoading,setIsLoading]= useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchRoles = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          if (mounted) {
            setRoles([]);
            setUserId(null);
            setEmail(null);
            setFullName(null);
            setIsLoading(false);
          }
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("roles, full_name, email")
          .eq("id", session.user.id)
          .single();

        if (mounted) {
          if (error || !profile) {
            // Profile missing — treat as member until synced
            setRoles(["member"]);
          } else {
            setRoles((profile.roles ?? ["member"]) as AppRole[]);
            setFullName(profile.full_name ?? null);
            setEmail(profile.email ?? session.user.email ?? null);
          }
          setUserId(session.user.id);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[useRole] Failed to fetch roles:", err);
        if (mounted) {
          setRoles(["member"]);
          setIsLoading(false);
        }
      }
    };

    fetchRoles();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchRoles();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ANY match helper
  const hasAnyRole = (required: AppRole[]) =>
    required.some(r => roles.includes(r));

  // Permission checker
  const can = (permission: Permission): boolean =>
    hasAnyRole(PERMISSIONS[permission]);

  return {
    roles,
    isLoading,
    userId,
    email,
    fullName,
    isAdmin:      roles.includes("admin"),
    isCutter:     hasAnyRole(["cutter", "admin"]),
    isManager:    hasAnyRole(["manager", "admin"]),
    isSupervisor: hasAnyRole(["supervisor", "admin"]),
    isMember:     roles.includes("member"),
    isViewer:     roles.includes("viewer"),
    can,
    hasAnyRole,
  };
}