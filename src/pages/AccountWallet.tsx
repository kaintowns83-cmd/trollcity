import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

const AccountWallet = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [paymentsClient, setPaymentsClient] = useState<any>(null)
  const [cardInstance, setCardInstance] = useState<any>(null)
  const [linking, setLinking] = useState<string>('')
  const mountedRef = useRef(false)
  const [methods, setMethods] = useState<any[]>([])

  useEffect(() => {
    if (!user) navigate('/auth')
  }, [user, navigate])

  // 🔹 Load saved cards from Supabase
  const loadMethods = async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('user_payment_methods')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })

    if (!error) setMethods(data || [])
  }

  useEffect(() => { loadMethods() }, [user?.id])

  // 🔹 Initialize Square UI Card Input
  useEffect(() => {
    const init = async () => {
      if (!user) return
      if (mountedRef.current) return
      mountedRef.current = true

      const appId = import.meta.env.VITE_SQUARE_APPLICATION_ID
      const locationId = import.meta.env.VITE_SQUARE_LOCATION_ID
      const src = 'https://web.squarecdn.com/v1/square.js'

      if (!(window as any).Square) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script')
          script.src = src
          script.onload = () => resolve()
          document.body.appendChild(script)
        })
      }

      const payments = await (window as any).Square.payments(appId, locationId)
      setPaymentsClient(payments)

      let container = document.getElementById('wallet-card-container')
      if (!container) return

      const card = await payments.card()
      setCardInstance(card)
      await card.attach('#wallet-card-container')
    }
    init()
    return () => { mountedRef.current = false }
  }, [user])

  // 🟣 FIXED — Directly Save Card to Supabase (No Backend /API Calls)
  const linkCard = async () => {
    if (!paymentsClient || !cardInstance) return
    setLinking('card')
    try {
      const tokenResult = await cardInstance.tokenize()
      if (!tokenResult || tokenResult.status !== 'OK') {
        throw new Error('Tokenization failed')
      }

      const { token, card } = tokenResult
      const brand = card?.brand || 'Card'
      const last4 = card?.last4 || '0000'
      const exp_month = card?.expMonth || null
      const exp_year = card?.expYear || null

      const { error } = await supabase.from('user_payment_methods').insert([
        {
          user_id: user?.id,
          provider: 'card',
          token_id: token,
          brand,
          last4,
          exp_month,
          exp_year,
          display_name: `${brand} ••••${last4}`,
          is_default: true,
        }
      ])

      if (error) throw error

      toast.success('Payment method securely saved')
      await loadMethods()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to link card')
    }
    setLinking('')
  }

  const deleteAccount = async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token || ''
      await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      toast.success('Account deleted')
      navigate('/auth')
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0814] via-[#0D0D1A] to-[#14061A] text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-6">Wallet & Payments</h1>

        {/* 🔹 Card UI Container */}
        <div
          id="wallet-card-container"
          className="mt-4 p-4 bg-[#0D0D0D] rounded border border-[#2C2C2C]"
        />

        <button
          onClick={linkCard}
          disabled={linking === 'card'}
          className="mt-3 w-full py-3 rounded bg-[#7C3AED]"
        >
          {linking === 'card' ? 'Saving card…' : 'Save Debit Card'}
        </button>

        <h2 className="text-xl mt-8 font-semibold">Linked Payment Methods</h2>
        {methods.length === 0 && <p>No methods linked.</p>}

        {methods.map(m => (
          <div key={m.id} className="p-4 mt-2 rounded bg-[#0D0D0D] border border-[#2C2C2C] flex justify-between">
            <div>
              <div className="font-semibold">{m.display_name}</div>
              <div className="text-xs text-gray-400">{m.brand} •••• {m.last4}</div>
            </div>
            {m.is_default && <span className="text-green-400 text-xs">Default</span>}
          </div>
        ))}

        <button
          onClick={deleteAccount}
          className="mt-8 px-4 py-3 rounded bg-red-600 text-white"
        >
          Delete Account
        </button>
      </div>
    </div>
  )
}

export default AccountWallet
