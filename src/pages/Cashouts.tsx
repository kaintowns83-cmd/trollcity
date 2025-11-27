import React, { useEffect, useState } from 'react'
import PayoutHistoryCard from '../components/PayoutHistoryCard'
import { DollarSign, Coins, Clock } from 'lucide-react'
import { supabase, CashoutTier, UserProfile } from '../lib/supabase'
import { useAuthStore } from '../lib/store'
import { toast } from 'sonner'

interface PayoutRequest {
  id: string
  coins_used: number
  cash_amount: number
  currency: string
  processing_fee: number
  net_amount: number
  status: 'pending' | 'approved' | 'paid' | 'completed' | 'rejected'
  created_at: string
}

const Cashouts = () => {
  const { profile } = useAuthStore()
  const [tiers, setTiers] = useState<CashoutTier[]>([])
  const [requests, setRequests] = useState<PayoutRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState<string | null>(null)
  const [availableEarnedCoins, setAvailableEarnedCoins] = useState(0)

  useEffect(() => {
    loadData()
  }, [profile?.id])

  const loadData = async () => {
    try {
      setLoading(true)

      const [{ data: tierData }, { data: reqData }, { data: prof }] = await Promise.all([
        supabase
          .from('cashout_tiers')
          .select('*')
          .eq('is_active', true)
          .order('coin_amount', { ascending: true }),

        supabase
          .from('payout_requests')
          .select('*')
          .eq('user_id', profile?.id)
          .order('created_at', { ascending: false }),

        profile
          ? supabase.from('user_profiles').select('*').eq('id', profile.id).single()
          : Promise.resolve({ data: null }),
      ])

      setTiers((tierData as CashoutTier[]) || [])
      setRequests((reqData as PayoutRequest[]) || [])

      if (prof) {
        const { data: used } = await supabase
          .from('payout_requests')
          .select('coins_used')
          .in('status', ['pending', 'approved', 'paid'])
          .eq('user_id', profile?.id || '')

        const reserved = (used || []).reduce((s: number, r: any) => s + (r.coins_used || 0), 0)
        const avail = Math.max(0, ((prof as UserProfile).total_earned_coins || 0) - reserved)
        setAvailableEarnedCoins(avail)
      }
    } catch (e) {
      toast.error('Failed to load cashouts')
    } finally {
      setLoading(false)
    }
  }

  const requestCashout = async (tier: CashoutTier) => {
    if (!profile) return
    if (availableEarnedCoins < tier.coin_amount) {
      toast.error('Not enough earned coins for this tier')
      return
    }

    try {
      setRequesting(tier.id)

      const feePercent = Number((tier as any).processing_fee_percentage) || 0
      const fee = Number(tier.cash_amount) * (feePercent / 100)
      const net = Number(tier.cash_amount) - fee

      const { error: insertError } = await supabase
        .from('payout_requests')
        .insert([
          {
            user_id: profile.id,
            coins_used: tier.coin_amount,
            cash_amount: tier.cash_amount,
            currency: tier.currency,
            processing_fee: Number(fee.toFixed(2)),
            net_amount: Number(net.toFixed(2)),
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ])

      if (insertError) throw insertError

      toast.success('Cashout request submitted')
      await loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to request cashout')
    } finally {
      setRequesting(null)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-troll-gold text-xl">Loading cashouts...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-troll-green-neon">Cashouts</h1>
          <p className="text-troll-purple-300">Convert earned coins to cash using tiers</p>

          <div className="mt-4 inline-flex items-center space-x-4 bg-troll-purple-dark rounded-lg px-6 py-3 border border-troll-purple">
            <Coins className="w-5 h-5 text-troll-gold" />
            <span className="text-troll-purple-300">Available Earned Coins:</span>
            <span className="text-white font-semibold">{availableEarnedCoins}</span>
          </div>
        </div>

        {/* Tier Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {tiers.map((tier) => (
            <div key={tier.id} className="bg-troll-purple-dark rounded-lg p-6 border border-troll-purple">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-white text-xl font-semibold">{tier.coin_amount.toLocaleString()} Coins</div>
                  <div className="text-troll-purple-300">{tier.currency} ${Number(tier.cash_amount).toFixed(2)}</div>
                </div>
                <DollarSign className="w-6 h-6 text-troll-green" />
              </div>
              <div className="text-sm text-troll-purple-300 mb-4">
const feePercent = Number(tier.processing_fee_percentage) || 0
                Processing fee: {(Number(tier.processing_fee_percentage) || 0).toFixed(1)}%
              </div>
              <button
                onClick={() => requestCashout(tier)}
                disabled={availableEarnedCoins < tier.coin_amount || requesting === tier.id}
                className={`w-full px-4 py-2 rounded-lg font-semibold ${
                  availableEarnedCoins < tier.coin_amount || requesting === tier.id
                    ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                    : 'bg-troll-green text-troll-purple-900 hover:bg-troll-green-dark'
                }`}
              >
                {requesting === tier.id ? 'Requesting…' : 'Request Cashout'}
              </button>
            </div>
          ))}
        </div>

        {/* History Section */}
        <div className="bg-troll-purple-dark rounded-lg border border-troll-purple">
          <div className="p-6 border-b border-troll-purple">
            <h2 className="text-xl font-semibold text-white flex items-center">
              <Clock className="w-5 h-5 text-troll-gold mr-2" /> Recent Requests
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-troll-purple-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs text-troll-purple-300 uppercase tracking-wider">Coins</th>
                  <th className="px-6 py-3 text-left text-xs text-troll-purple-300 uppercase tracking-wider">Net</th>
                  <th className="px-6 py-3 text-left text-xs text-troll-purple-300 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs text-troll-purple-300 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-4 text-sm text-white">{r.coins_used.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-troll-green">${r.net_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        r.status === 'pending'
                          ? 'bg-yellow-900 text-yellow-200'
                          : r.status === 'approved'
                          ? 'bg-blue-900 text-blue-200'
                          : r.status === 'paid' || r.status === 'completed'
                          ? 'bg-green-900 text-green-200'
                          : 'bg-red-900 text-red-200'
                      }`}>
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-troll-purple-300">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <PayoutHistoryCard />
      </div>
    </div>
  )
}

export default Cashouts
