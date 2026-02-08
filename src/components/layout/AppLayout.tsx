import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  LayoutDashboard,
  FolderPlus,
  FilePlus,
  FileText,
  LogOut,
  Menu,
  Package,
  Layers,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';


interface AppLayoutProps {
  children: React.ReactNode;
}

// Define items with optional adminOnly flag (extending the object structure implicitly)
const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/shelves', label: 'Shelves', icon: Layers },
  { path: '/cabinets', label: 'Cabinets', icon: Package },
  { path: '/folders', label: 'Folders', icon: FolderPlus },
  { path: '/visual-allocation', label: 'Visual Map', icon: LayoutDashboard },
  { path: '/procurement/add', label: 'Add Procurement', icon: FilePlus },
  { path: '/procurement/list', label: 'Records', icon: FileText },
  { path: '/users', label: 'User Management', icon: Users, adminOnly: true },
];

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const NavContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <img src="/logo.png" alt="ProcureFlow Logo" className="h-8 w-8" />
        <span className="text-xl font-bold text-foreground">ProcureFlow</span>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems
          .filter(item => !item.adminOnly || user?.role === 'admin')
          .map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative',
                  isActive
                    ? 'bg-primary text-primary-foreground hover:text-white'
                    : 'text-muted-foreground hover:bg-accent hover:text-white'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
      </nav>

      <div className="border-t border-border p-4">
        <div className="mb-3 px-3">
          <p className="text-sm font-medium text-foreground">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-5 w-5" />
              Logout
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to log out? You will need to sign in again to access your account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout} className="bg-destructive hover:bg-destructive/90">
                Logout
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 border-r border-border bg-card lg:block h-screen sticky top-0">
        <NavContent />
      </aside>

      {/* Mobile Header */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="ProcureFlow Logo" className="h-8 w-8" />
            <span className="font-bold text-foreground">ProcureFlow</span>
          </div>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <NavContent />
            </SheetContent>
          </Sheet>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;