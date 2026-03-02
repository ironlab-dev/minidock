"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { client } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import { motion, AnimatePresence } from "framer-motion";
import {
    UserPlus,
    Shield,
    Key,
    Loader2
} from "lucide-react";
import { PageLayout, PageHeader, Button, Badge } from "@/components/ui";

interface User {
    id: string;
    username: string;
    role: string;
    createdAt?: string;
}

export default function AdminUsersPage() {
    const { isAdmin, loading, checkRegistrationPolicy } = useAuth();
    const router = useRouter();
    const { t } = useTranslation();
    const [users, setUsers] = useState<User[]>([]);
    const [allowRegistration, setAllowRegistration] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" });
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [resettingId, setResettingId] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [showResetModal, setShowResetModal] = useState(false);

    useEffect(() => {
        if (!loading && !isAdmin) {
            router.push("/");
            return;
        }

        if (isAdmin) {
            fetchData();
        }
    }, [isAdmin, loading, router]);

    const fetchData = async () => {
        try {
            const [usersData, settingsData] = await Promise.all([
                client.get<User[]>("/admin/users"),
                client.get<{ key: string; value: string }[]>("/settings")
            ]);
            setUsers(usersData);

            const regSetting = settingsData.find(s => s.key === "auth_allow_registration");
            setAllowRegistration(regSetting ? regSetting.value === "true" : true);
        } catch (error) {
            console.error("Failed to fetch admin data", error);
        }
    };

    const handleToggleRegistration = async () => {
        try {
            const newState = !allowRegistration;
            await client.put("/admin/settings/registration", { allow: newState });
            setAllowRegistration(newState);
            // Proactively refresh the global auth policy state
            checkRegistrationPolicy();
        } catch (error) {
            console.error("Failed to toggle registration", error);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCreating(true);
        try {
            await client.post("/admin/users", newUser);
            setShowCreateModal(false);
            setNewUser({ username: "", password: "", role: "user" });
            fetchData();
        } catch (error) {
            console.error("Failed to create user", error);
        } finally {
            setIsCreating(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resettingId) return;

        try {
            await client.put(`/admin/users/${resettingId}/password`, { newPassword });
            setShowResetModal(false);
            setResettingId(null);
            setNewPassword("");
            alert(t.admin.password_reset_success);
        } catch (error) {
            console.error("Failed to reset password", error);
        }
    };

    if (loading || !isAdmin) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin text-white" /></div>;

    return (
        <PageLayout>
            <PageHeader
                title={t.admin.user_management}
                subtitle={t.admin.manage_users_desc}
                variant="blue"
                statusBadges={
                    <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.admin.public_registration}</span>
                        <button
                            onClick={handleToggleRegistration}
                            className={`relative w-9 h-5 rounded-full transition-colors ${allowRegistration ? 'bg-green-500' : 'bg-gray-600'}`}
                        >
                            <span
                                className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${allowRegistration ? 'translate-x-4' : ''}`}
                            />
                        </button>
                    </div>
                }
            >
                <Button
                    onClick={() => setShowCreateModal(true)}
                    variant="primary"
                    className="flex items-center gap-2"
                >
                    <UserPlus className="w-4 h-4" />
                    {t.admin.add_user}
                </Button>
            </PageHeader>

            <div className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-8">
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="glass-card rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02] backdrop-blur-md">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white/5 border-b border-white/5">
                                        <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-[0.1em]">{t.admin.user}</th>
                                        <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-[0.1em]">{t.admin.role}</th>
                                        <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-[0.1em]">{t.admin.created}</th>
                                        <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-[0.1em] text-right">{t.admin.actions}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {users.map((u) => (
                                        <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border border-white/5 flex items-center justify-center text-xs font-bold text-gray-400 group-hover:text-white transition-colors uppercase">
                                                        {u.username.substring(0, 2)}
                                                    </div>
                                                    <span className="font-semibold text-gray-200 group-hover:text-white transition-colors">{u.username}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {u.role === 'admin' ? (
                                                    <Badge variant="purple" pulse>
                                                        <Shield className="w-3 h-3 mr-1" />
                                                        {t.admin.admin_role}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="gray">
                                                        {t.admin.user_role}
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-xs font-mono text-gray-500">
                                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => { setResettingId(u.id); setShowResetModal(true); }}
                                                    className="text-gray-500 hover:text-white p-2.5 rounded-xl hover:bg-white/5 transition-all active:scale-95"
                                                    title={t.admin.reset_password}
                                                >
                                                    <Key className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Create User Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-[#1c1c1e] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden p-[1px] bg-gradient-to-b from-white/10 to-transparent"
                        >
                            <div className="bg-[#1c1c1e] p-6 rounded-2xl">
                                <h2 className="text-xl font-bold text-white mb-6 tracking-tight">{t.admin.create_new_user}</h2>
                                <form onSubmit={handleCreateUser} className="space-y-5">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t.auth.username}</label>
                                        <input
                                            type="text"
                                            className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                            value={newUser.username}
                                            onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                            required
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t.auth.password}</label>
                                        <input
                                            type="password"
                                            className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                            value={newUser.password}
                                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t.admin.role}</label>
                                        <select
                                            className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
                                            value={newUser.role}
                                            onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                        >
                                            <option value="user" className="bg-[#1c1c1e]">{t.admin.user_role}</option>
                                            <option value="admin" className="bg-[#1c1c1e]">{t.admin.admin_role}</option>
                                        </select>
                                    </div>
                                    <div className="flex justify-end gap-3 mt-8 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowCreateModal(false)}
                                            className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                                        >
                                            {t.admin.cancel}
                                        </button>
                                        <Button
                                            type="submit"
                                            disabled={isCreating}
                                            isLoading={isCreating}
                                        >
                                            {t.admin.create}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Reset Password Modal */}
            <AnimatePresence>
                {showResetModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-[#1c1c1e] w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl overflow-hidden p-[1px] bg-gradient-to-b from-white/10 to-transparent"
                        >
                            <div className="bg-[#1c1c1e] p-6 rounded-2xl">
                                <h2 className="text-xl font-bold text-white mb-6 tracking-tight">{t.admin.reset_password}</h2>
                                <form onSubmit={handleResetPassword} className="space-y-5">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t.admin.new_password}</label>
                                        <input
                                            type="password"
                                            className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <div className="flex justify-end gap-3 mt-8 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => { setShowResetModal(false); setResettingId(null); }}
                                            className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                                        >
                                            {t.admin.cancel}
                                        </button>
                                        <Button
                                            type="submit"
                                            variant="danger"
                                        >
                                            {t.admin.reset_password}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </PageLayout>
    );
}
