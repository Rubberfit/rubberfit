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

  // Inventory 
  viewInventory:          ["admin", "manager", "supervisor", "cutter", "member", "viewer"] as AppRole[],
  manageRolls:            ["admin", "manager"]                                             as AppRole[],

  // Cut Planner 
  cutAccess:              ["admin", "cutter"]                                   as AppRole[],
  accessCutPlanner:       ["admin", "manager", "supervisor", "cutter"]                     as AppRole[],
  createCut:              ["admin", "cutter"]                                              as AppRole[],
  accessBatchCut:         ["admin", "cutter"]                                              as AppRole[],
  approveCut:             ["admin", "supervisor"]                                          as AppRole[],
  viewCutHistory:         ["admin", "manager", "supervisor", "cutter"]                     as AppRole[],

  // Management 
  accessManagement:       ["admin", "manager"]                                             as AppRole[],
  manageMaterialTypes:    ["admin", "manager"]                                             as AppRole[],
  manageSuppliers:        ["admin", "manager"]                                             as AppRole[],
  managePricing:          ["admin"]                                                        as AppRole[],
  manageUsers:            ["admin"]                                                        as AppRole[],

  // Analytics 
  accessAnalytics:        ["admin", "manager", "supervisor"]                               as AppRole[],
  viewCurrentAnalysis:    ["admin", "manager", "supervisor"]                               as AppRole[],
  viewPeriodConsumption:  ["admin", "manager"]                                             as AppRole[],
  viewMaterialUsage:      ["admin", "manager", "supervisor"]                               as AppRole[],
  viewCostReports:        ["admin", "manager"]                                             as AppRole[],
  viewTrends:             ["admin", "manager"]                                             as AppRole[],
  viewReports:            ["admin", "manager", "supervisor"]                               as AppRole[],

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