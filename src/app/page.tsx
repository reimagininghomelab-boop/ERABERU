'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function Home() {
  const [agents, setAgents] = useState<any[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('safe_salesperson_profiles')
      .select('*')
      .then(({ data }) => {
        if (data) setAgents(data)
      })
  }, [])

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">営業の通知表</h1>
      <p className="text-gray-500 mb-8">あなたにぴったりの住宅営業マンを探そう</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <div key={agent.id} className="bg-white rounded-2xl shadow p-6">
            <div className="w-16 h-16 bg-gray-200 rounded-full mb-4 flex items-center justify-center text-2xl">
              👤
            </div>
            <p className="text-xs text-gray-400 mb-1">{agent.company_name}</p>
            <h2 className="text-lg font-bold text-gray-800 mb-1">{agent.name_to_show}</h2>
            <p className="text-sm text-gray-500 mb-4">{agent.display_name}</p>
            <button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-xl transition">
              プロフィールを見る（¥1,000）
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}