// src/App.tsx
import React, { useState, useEffect, Suspense, lazy } from 'react'
import { useLocation, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from './lib/store'
import { supabase, isAdminEmail } from './lib/supabase'
import { Toaster, toast } from 'sonner'

// COMPONENTS
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import ProfileSetupModal from './components/ProfileSetupModal'

// STATIC (keep Home/Auth fast)
import Home from './pages/Home'
import Auth from './pages/Auth'
import AuthCallback from './pages/AuthCallback'
import TermsAgreement from './pages/TermsAgreement'
import ProfileSetup from './pages/ProfileSetup'

// LAZY LOADED — reduce bundle size
const GoLive = lazy(() => import('./pages/GoLive'))
const StreamRoom = lazy(() => import('./pages/StreamRoom'))
const StreamSummary = lazy(() => import('./pages/StreamSummary'))
const Messages = lazy(() => import('./pages/Messages'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Trollifications = lazy(() => import('./pages/Trollifications'))
const Following = lazy(() => import('./pages/Following'))
const Application = lazy(() => import('./pages/Application'))
const TrollOfficerLounge = lazy(() => import('./pages/TrollOfficerLounge'))
const TrollFamily = lazy(() => import('./pages/TrollFamily'))
const TrollFamilyCity = lazy(() => import('./pages/TrollFamilyCity'))
const FamilyProfilePage = lazy(() => import('./pages/FamilyProfilePage'))
const FamilyWarsPage = lazy(() => import('./pages/FamilyWarsPage'))
const FamilyChatPage = lazy(() => import('./pages/FamilyChatPage'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const TrollerInsurance = lazy(() => import('./pages/TrollerInsurance'))
const Cashouts = lazy(() => import('./pages/Cashouts'))
const EarningsPayout = lazy(() => import('./pages/EarningsPayout'))
const Support = lazy(() => import('./pages/Support'))
const AccountWallet = lazy(() => import('./pages/AccountWallet'))
const AccountPaymentsSuccess = lazy(() => import('./pages/AccountPaymentsSuccess'))
const AccountPaymentLinkedSuccess = lazy(() => import('./pages/AccountPaymentLinkedSuccess'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminRFC = lazy(() => import('./components/AdminRFC'))
const Profile = lazy(() => import('./pages/Profile'))
const TrollWheel = lazy(() => import('./pages/TrollWheel'))
const TransactionHistory = lazy(() => import('./pages/TransactionHistory'))
const Changelog = lazy(() => import('./pages/Changelog'))
const FamilyApplication = lazy(() => import('./pages/FamilyApplication'))
const OfficerApplication = lazy(() => import('./pages/OfficerApplication'))
const TrollerApplication = lazy(() => import('./pages/TrollerApplication'))
const CoinStore = lazy(() => import('./pages/CoinStore'))
const FamilyCityMap = lazy(() => import('./FamilyCityMap'))

function App() {
  const {
    user,
    profile,
    setAuth,
    setProfile,
    setLoading,
    setIsAdmin,
    isLoading,
  } = useAuthStore()

  const location = useLocation()
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileModalLoading, setProfileModalLoading] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [installed, setInstalled] = useState(() => {
    try { return localStorage.getItem('pwa-installed') === 'true' } catch { return false }
  })

  // --- Require Auth (unchanged, fully correct) ---
  const RequireAuth = () => {
    const { user, profile, isLoading } = useAuthStore()
    const location = useLocation()

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0A0814] text-white">
          <div className="animate-pulse px-6 py-3 rounded bg-[#121212] border border-[#2C2C2C]">
            Loading…
          </div>
        </div>
      )
    }

    if (!user) return <Navigate to="/auth" replace />

    const needsTerms =
      profile && profile.terms_accepted === false && profile.role !== 'admin'
    if (needsTerms && location.pathname !== '/terms') {
      return <Navigate to="/terms" replace />
    }

    return <Outlet />
  }

  // --- FamilyAccessRoute (unchanged) ---
  const FamilyAccessRoute = () => {
    const { user, profile } = useAuthStore()
    const [allowed, setAllowed] = useState<boolean | null>(null)

    useEffect(() => {
      const run = async () => {
        if (!user) return setAllowed(false)
        if (profile?.role === 'admin') return setAllowed(true)

        try {
          const { data: member } = await supabase
            .from('troll_family_members')
            .select('approved, has_crown_badge')
            .eq('user_id', user.id)
            .maybeSingle()

          const { data: payment } = await supabase
            .from('coin_transactions')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'completed')
            .ilike('description', '%Family Lounge%')
            .maybeSingle()

          setAllowed(!!member?.approved && !!member?.has_crown_badge && !!payment)
        } catch {
          setAllowed(false)
        }
      }
      run()
    }, [user?.id, profile?.role])

    if (allowed === null) return <LoadingScreen />
    return allowed ? <Outlet /> : <Navigate to="/apply/family" replace />
  }

  // --- Session restore & Profile logic (unchanged, fixed admin caching ok) ---
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const currentUser = session?.user ?? null
        setAuth(currentUser, session)

        if (session?.user) {
          const isAdmin = isAdminEmail(session.user.email)

          // Load cached admin profile
          if (isAdmin) {
            const cached = localStorage.getItem('admin-profile-cache')
            if (cached) {
              try { setProfile(JSON.parse(cached)); setIsAdmin(true) } catch {}
            }

            try {
              const result = await (await import('./lib/api')).default.post('/auth/fix-admin-role')
              if (result.success && result.profile) {
                setProfile(result.profile)
                setIsAdmin(true)
                localStorage.setItem('admin-profile-cache', JSON.stringify(result.profile))
                setLoading(false)
                return
              }
            } catch {}
          }

          // Normal profile fetch
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()

          if (profileData) {
            if (isAdmin && profileData.role !== 'admin') {
              const { data: updated } = await supabase
                .from('user_profiles')
                .update({ role: 'admin' })
                .eq('id', session.user.id)
                .select('*')
                .single()
              setProfile(updated || profileData)
              setIsAdmin(true)
            } else {
              setProfile(profileData)
              if (profileData.role === 'admin') setIsAdmin(true)
            }
          } else {
            setProfile(null)
          }
        } else {
          setProfile(null)
        }
      } catch {}
      finally {
        setLoading(false)
      }
    }
    initializeAuth()
  }, [])

  // --- Install prompt code (unchanged) ---
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    const handleInstalled = () => {
      localStorage.setItem('pwa-installed', 'true')
      setInstalled(true)
      setInstallPrompt(null)
      toast.success('App installed')
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  // --- Loading component for Suspense ---
  const LoadingScreen = () => (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0814] text-white">
      <div className="animate-pulse px-6 py-3 rounded bg-[#121212] border border-[#2C2C2C]">
        Loading…
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0814] via-[#0D0D1A] to-[#14061A] text-white">
      <div className="flex min-h-screen">
        {user && <Sidebar />}
        <div className="flex flex-col flex-1 min-h-screen">
          {user && <Header />}

          <main className="flex-1 overflow-y-auto bg-[#121212]">
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route element={<RequireAuth />}>

                  <Route path="/" element={<Home />} />
                  <Route path="/go-live" element={<GoLive />} />
                  <Route path="/messages" element={<Messages />} />
                  <Route path="/stream/:streamId" element={<StreamRoom />} />
                  <Route path="/stream/:id/summary" element={<StreamSummary />} />
                  <Route path="/store" element={<CoinStore />} />
                  <Route path="/earnings" element={<EarningsPayout />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/family/city" element={<TrollFamilyCity />} />

                  {/* Officer Lounge */}
                  <Route
                    path="/officer/lounge"
                    element={
                      profile?.role === 'troll_officer' || profile?.role === 'admin'
                        ? <TrollOfficerLounge />
                        : <Navigate to="/" replace />
                    }
                  />

                  {/* Admin route */}
                  <Route
                    path="/admin"
                    element={
                      profile?.role === 'admin'
                        ? <AdminDashboard />
                        : <Navigate to="/" replace />
                    }
                  />

                </Route>

                {/* Auth & Terms */}
                <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/terms" element={<TermsAgreement />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>

      <ProfileSetupModal
        isOpen={profileModalOpen}
        onSubmit={(u, b) => {}}
        loading={profileModalLoading}
        onClose={() => setProfileModalOpen(false)}
      />

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#2e1065',
            color: '#fff',
            border: '1px solid #22c55e',
            boxShadow: '0 0 15px rgba(34, 197, 94, 0.5)',
          }
        }}
      />
    </div>
  )
}

export default App
