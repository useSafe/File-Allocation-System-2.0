import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { addProcurement } from '@/lib/storage';
import { useData } from '@/contexts/DataContext';
import { Cabinet, Shelf, Folder, ProcurementStatus, Procurement } from '@/types/procurement';
import { toast } from 'sonner';
import { Loader2, Save, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

const AddProcurement: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    // const [cabinets, setCabinets] = useState<Cabinet[]>([]);
    // const [shelves, setShelves] = useState<Shelf[]>([]);
    // const [folders, setFolders] = useState<Folder[]>([]);
    // const [procurements, setProcurements] = useState<Procurement[]>([]);
    const { cabinets, shelves, folders, procurements } = useData();

    // Filtered location options based on selection
    const [availableShelves, setAvailableShelves] = useState<Shelf[]>([]);
    const [availableFolders, setAvailableFolders] = useState<Folder[]>([]);

    // Form State
    const [prNumber, setPrNumber] = useState('');
    const [description, setDescription] = useState('');
    const [cabinetId, setCabinetId] = useState('');
    const [shelfId, setShelfId] = useState('');
    const [folderId, setFolderId] = useState('');
    const [status, setStatus] = useState<ProcurementStatus>('active');
    const [date, setDate] = useState<Date | undefined>(new Date());

    // useEffect(() => {
    //     // Subscribe to real-time updates
    //     // const unsubCabinets = onCabinetsChange(setCabinets);
    //     // const unsubShelves = onShelvesChange(setShelves);
    //     // const unsubFolders = onFoldersChange(setFolders);
    //     // const unsubProcurements = onProcurementsChange(setProcurements);

    //     // return () => {
    //     //     unsubCabinets();
    //     //     unsubShelves();
    //     //     unsubFolders();
    //     //     unsubProcurements();
    //     // };
    // }, []);

    // Update available shelves when cabinet changes
    useEffect(() => {
        if (cabinetId) {
            setAvailableShelves(shelves.filter(s => s.cabinetId === cabinetId));
            setShelfId('');
            setFolderId('');
        } else {
            setAvailableShelves([]);
        }
    }, [cabinetId, shelves]);

    // Update available folders when shelf changes
    useEffect(() => {
        if (shelfId) {
            setAvailableFolders(folders.filter(f => f.shelfId === shelfId));
            setFolderId('');
        } else {
            setAvailableFolders([]);
        }
    }, [shelfId, folders]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prNumber || !description || !cabinetId || !shelfId || !folderId) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsLoading(true);

        try {
            const procurementData: any = {
                prNumber,
                description,
                cabinetId,
                shelfId,
                folderId,
                status,
                urgencyLevel: 'medium', // Default value
                dateAdded: date ? date.toISOString() : new Date().toISOString(),
                tags: [], // Empty array
            };

            // Only add notes if it has a value
            // Don't include it at all if undefined to avoid Firestore errors

            const newProcurement = await addProcurement(
                procurementData,
                user?.email || 'unknown@example.com',
                user?.name || 'Unknown User'
            );

            // If the file is archived, calculate and assign stack number
            if (status === 'archived') {
                // Get all archived files in the same folder
                const filesInFolder = procurements
                    .filter(p => p.folderId === folderId && p.status === 'archived')
                    .sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime());

                // The new file should be the last one
                const stackNumber = filesInFolder.length + 1;

                // Update the newly created file with its stack number
                await updateProcurement(newProcurement.id, { stackNumber });
            }

            toast.success('File record added successfully');
            navigate('/dashboard');
        } catch (error: any) {
            toast.error(error.message || 'Failed to add file record');
        } finally {
            setIsLoading(false);
        }
    };


    // Format PR Number: AAA-AAA-AA-AAA
    const handlePRNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); // Remove illegal chars (keep hyphens allowed for backspace handling ease)

        // Remove existing hyphens for raw processing
        const rawValue = value.replace(/-/g, '');
        let formattedValue = '';

        if (rawValue.length > 0) {
            formattedValue = rawValue.substring(0, 3);
        }
        if (rawValue.length > 3) {
            formattedValue += '-' + rawValue.substring(3, 6);
        }
        if (rawValue.length > 6) {
            formattedValue += '-' + rawValue.substring(6, 8);
        }
        if (rawValue.length > 8) {
            formattedValue += '-' + rawValue.substring(8, 11);
        }

        // Limit length (14 chars: 3+1+3+1+2+1+3)
        if (formattedValue.length > 14) {
            formattedValue = formattedValue.substring(0, 14);
        }

        setPrNumber(formattedValue);
    };

    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-white">
                    Add New Procurement
                </h1>
                <p className="text-slate-400 mt-1">Create a new procurement record and track its location</p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid gap-6 lg:grid-cols-1">
                    {/* Main Column */}
                    <div className="space-y-6">
                        <Card className="border-none bg-[#0f172a] shadow-lg">
                            <CardContent className="p-6 space-y-6">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">Basic Information</h3>
                                    <p className="text-sm text-slate-400">Essential details about the procurement</p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">PR Number(Divison-Month-Year-Number) *</Label>
                                        <Input
                                            placeholder="e.g., DIV-JAN-26-001"
                                            value={prNumber}
                                            onChange={handlePRNumberChange}
                                            maxLength={14}
                                            className="bg-[#1e293b] border-slate-700 text-white placeholder:text-slate-500 uppercase"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Date Added</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="w-full justify-start text-left font-normal bg-[#1e293b] border-slate-700 text-white hover:bg-[#253045]"
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {date ? format(date, 'PPP') : <span>Pick a date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 bg-[#1e293b] border-slate-700">
                                                <Calendar
                                                    mode="single"
                                                    selected={date}
                                                    onSelect={setDate}
                                                    initialFocus
                                                    className="bg-[#1e293b] text-white"
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-slate-300">Description *</Label>
                                    <Textarea
                                        placeholder="Describe the items or services..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="bg-[#1e293b] border-slate-700 text-white placeholder:text-slate-500 min-h-[100px]"
                                        required
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Physical Location & Status */}
                        <Card className="border-none bg-[#0f172a] shadow-lg">
                            <CardContent className="p-6 space-y-6">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">Physical Location</h3>
                                    <p className="text-sm text-slate-400">Cabinet#-Shelf#-Folder#</p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Shelf *</Label>
                                        <Select value={cabinetId} onValueChange={setCabinetId}>
                                            <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                                <SelectValue placeholder="Select shelf" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1e293b] border-slate-700">
                                                {cabinets.map((c) => (
                                                    <SelectItem key={c.id} value={c.id} className="text-white">
                                                        {c.code} - {c.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Cabinet *</Label>
                                        <Select value={shelfId} onValueChange={setShelfId} disabled={!cabinetId}>
                                            <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                                <SelectValue placeholder="Select cabinet" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1e293b] border-slate-700">
                                                {availableShelves.map((s) => (
                                                    <SelectItem key={s.id} value={s.id} className="text-white">
                                                        {s.code} - {s.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-slate-300">Folder *</Label>
                                        <Select value={folderId} onValueChange={setFolderId} disabled={!shelfId}>
                                            <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                                <SelectValue placeholder="Select folder" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1e293b] border-slate-700">
                                                {availableFolders.map((f) => (
                                                    <SelectItem key={f.id} value={f.id} className="text-white">
                                                        {f.code} - {f.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-slate-300">Current Status</Label>
                                    <Select value={status} onValueChange={(val) => setStatus(val as ProcurementStatus)}>
                                        <SelectTrigger className="bg-[#1e293b] border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1e293b] border-slate-700">
                                            <SelectItem value="active" className="text-white">Borrowed</SelectItem>
                                            <SelectItem value="archived" className="text-white">Archived</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="mr-2 h-4 w-4" />
                                            Save Record
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default AddProcurement;