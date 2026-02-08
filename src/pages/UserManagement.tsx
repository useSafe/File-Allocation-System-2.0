import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { User } from '@/types/procurement';
import { onUsersChange, addUser, updateUser, deleteUser } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Search, Plus, Trash2, Edit, Shield, ShieldAlert, Key } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const UserManagement: React.FC = () => {
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

    // Modal State
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'user' as 'admin' | 'user',
        status: 'active' as 'active' | 'inactive'
    });

    useEffect(() => {
        // Access Control
        if (currentUser && currentUser.role !== 'admin') {
            toast.error("Unauthorized access");
            navigate('/');
            return;
        }

        const unsub = onUsersChange((data) => {
            setUsers(data);
            setIsLoading(false);
        });

        return () => unsub();
    }, [currentUser, navigate]);

    // Derived Data
    const filteredUsers = users.filter(u => {
        const matchesSearch =
            u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
        return matchesSearch && matchesRole && matchesStatus;
    });

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const resetForm = () => {
        setFormData({
            name: '',
            email: '',
            password: '',
            role: 'user',
            status: 'active'
        });
        setSelectedUser(null);
    };

    const validateUser = (data: typeof formData) => {
        if (!data.name || !data.email || !data.password) {
            toast.error('Name, Email, and Password are required');
            return false;
        }

        // Email Validation: Must be @gmail.com
        if (!data.email.toLowerCase().endsWith('@gmail.com')) {
            toast.error("Email must be a '@gmail.com' address");
            return false;
        }

        // Password Validation: 8 chars, 1 Upper, 1 Special, 1 Number
        const pw = data.password;
        if (pw.length < 8) {
            toast.error("Password must be at least 8 characters long");
            return false;
        }
        if (!/[A-Z]/.test(pw)) {
            toast.error("Password must contain at least one uppercase letter");
            return false;
        }
        if (!/\d/.test(pw)) {
            toast.error("Password must contain at least one number");
            return false;
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(pw)) {
            toast.error("Password must contain at least one special character");
            return false;
        }

        return true;
    };

    const handleAddUser = async () => {
        if (!validateUser(formData)) return;

        try {
            await addUser({
                id: '', // Placeholder
                name: formData.name,
                email: formData.email,
                password: formData.password,
                role: formData.role,
                status: formData.status
            });
            toast.success('User added successfully');
            setIsAddOpen(false);
            resetForm();
        } catch (error) {
            toast.error('Failed to add user');
        }
    };

    const handleEditUser = async () => {
        if (!selectedUser) return;
        if (!validateUser(formData)) return; // Validate also on edit

        try {
            await updateUser(selectedUser.id, {
                name: formData.name,
                email: formData.email,
                password: formData.password,
                role: formData.role,
                status: formData.status
            });
            toast.success('User updated successfully');
            setIsEditOpen(false);
            resetForm();
        } catch (error) {
            toast.error('Failed to update user');
        }
    };

    const handleDeleteUser = async (id: string) => {
        const userToDelete = users.find(u => u.id === id);
        // Admin Protection
        if (userToDelete?.email === 'admin@gmail.com') {
            toast.error("Cannot delete the main Admin user.");
            return;
        }

        if (confirm("Are you sure you want to delete this user? This cannot be undone.")) {
            try {
                await deleteUser(id);
                toast.success('User deleted');
            } catch (error) {
                toast.error('Failed to delete user');
            }
        }
    };

    const openEdit = (user: User) => {
        setSelectedUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            password: user.password || '',
            role: user.role,
            status: user.status
        });
        setIsEditOpen(true);
    };

    const toggleStatus = async (user: User) => {
        // Admin Protection
        if (user.email === 'admin@gmail.com') {
            toast.error("Cannot change status of main Admin user.");
            return;
        }

        const newStatus = user.status === 'active' ? 'inactive' : 'active';
        await updateUser(user.id, { status: newStatus });
        toast.success(`User set to ${newStatus}`);
    };

    // If unauthorized, don't verify (handled by useEffect redirect) but return null to avoid flash
    if (currentUser?.role !== 'admin') return null;

    return (
        <div className="space-y-6 fade-in animate-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">User Management</h1>
                    <p className="text-slate-400">Manage system access and roles</p>
                </div>
                <Button onClick={() => { resetForm(); setIsAddOpen(true); }} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="mr-2 h-4 w-4" /> Add User
                </Button>
            </div>

            <Card className="bg-[#0f172a] border-slate-800">
                <CardHeader className="pb-4">
                    <CardTitle className="text-white">Users</CardTitle>
                    <div className="flex gap-2 mt-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search users..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-[#1e293b] border-slate-700 text-white placeholder:text-slate-500"
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={(v: any) => setRoleFilter(v)}>
                            <SelectTrigger className="w-[150px] bg-[#1e293b] border-slate-700 text-white">
                                <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                <SelectItem value="all">All Roles</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="user">User</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                            <SelectTrigger className="w-[150px] bg-[#1e293b] border-slate-700 text-white">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1e293b] border-slate-700 text-white">
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableHead className="text-slate-300">User</TableHead>
                                <TableHead className="text-slate-300">Role</TableHead>
                                <TableHead className="text-slate-300">Status</TableHead>
                                <TableHead className="text-slate-300">Password</TableHead>
                                <TableHead className="text-slate-300">Created At</TableHead>
                                <TableHead className="text-right text-slate-300">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedUsers.map((user) => (
                                <TableRow key={user.id} className="border-slate-800 hover:bg-[#1e293b]">
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-white">{user.name}</p>
                                            <p className="text-xs text-slate-400">{user.email}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {user.role === 'admin' ? (
                                            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20">
                                                <Shield className="w-3 h-3 mr-1" /> Admin
                                            </Badge>
                                        ) : (
                                            <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 hover:bg-slate-500/20">
                                                User
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={user.status === 'active'}
                                                onCheckedChange={() => toggleStatus(user)}
                                                className="data-[state=checked]:bg-green-600"
                                                disabled={user.email === 'admin@gmail.com'}
                                            />
                                            <span className={`text-xs ${user.status === 'active' ? 'text-green-500' : 'text-slate-500'}`}>
                                                {user.status === 'active' ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 text-slate-500 font-mono text-xs bg-slate-950 p-1 px-2 rounded w-fit border border-slate-800">
                                            <Key className="w-3 h-3" />
                                            {user.password || '•••••'}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-slate-400 text-xs">
                                        {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => openEdit(user)} className="h-8 w-8 text-slate-400 hover:text-white">
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            {user.email !== 'admin@gmail.com' && (
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(user.id)} className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {paginatedUsers.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-slate-500 h-24">No users found.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Pagination Controls */}
            <div className="flex justify-between items-center text-sm text-slate-400">
                <div>Page {currentPage} of {totalPages || 1}</div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="border-slate-700 bg-transparent hover:bg-slate-800 text-white hover:text-white disabled:opacity-50"
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        className="border-slate-700 bg-transparent hover:bg-slate-800 text-white hover:text-white disabled:opacity-50"
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>

            {/* Add User Modal */ }
    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="bg-[#1e293b] border-slate-800 text-white">
            <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription className="text-slate-400">
                    Email must be @gmail.com. Password needs 8 chars, 1 uppercase, 1 number, 1 special char.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Name</Label>
                    <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="col-span-3 bg-[#0f172a] border-slate-700" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-right">Email</Label>
                    <Input id="email" type="email" placeholder="user@gmail.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="col-span-3 bg-[#0f172a] border-slate-700" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="password" className="text-right">Password</Label>
                    <Input id="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="col-span-3 bg-[#0f172a] border-slate-700" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Role</Label>
                    <Select value={formData.role} onValueChange={(v: 'admin' | 'user') => setFormData({ ...formData, role: v })}>
                        <SelectTrigger className="col-span-3 bg-[#0f172a] border-slate-700">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0f172a] border-slate-700 text-white">
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)} className="border-slate-700 text-white hover:bg-slate-800">Cancel</Button>
                <Button onClick={handleAddUser} className="bg-blue-600 hover:bg-blue-700">Create User</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    {/* Edit User Modal */ }
    <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-[#1e293b] border-slate-800 text-white">
            <DialogHeader>
                <DialogTitle>Edit User</DialogTitle>
                <DialogDescription className="text-slate-400">
                    Email must be @gmail.com. Password needs 8 chars, 1 uppercase, 1 number, 1 special char.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-name" className="text-right">Name</Label>
                    <Input id="edit-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="col-span-3 bg-[#0f172a] border-slate-700" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-email" className="text-right">Email</Label>
                    <Input id="edit-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="col-span-3 bg-[#0f172a] border-slate-700" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-password" className="text-right">Password</Label>
                    <Input id="edit-password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="col-span-3 bg-[#0f172a] border-slate-700" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Role</Label>
                    <Select value={formData.role} onValueChange={(v: 'admin' | 'user') => setFormData({ ...formData, role: v })}>
                        <SelectTrigger className="col-span-3 bg-[#0f172a] border-slate-700">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0f172a] border-slate-700 text-white">
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOpen(false)} className="border-slate-700 text-white hover:bg-slate-800">Cancel</Button>
                <Button onClick={handleEditUser} className="bg-blue-600 hover:bg-blue-700">Save Changes</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
        </div >
    );
};

export default UserManagement;
