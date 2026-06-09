'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const STATUSES = ["Lead", "Consultation", "Applied", "Offer", "Deposit Paid", "Enrolled", "Lost"]
const SOURCES = ["Xiaohongshu", "Wechat", "Walkin", "Subagent", "Friend", "Other"]
const COUNSELLORS = ["Counsellor 1", "Counsellor 2", "Counsellor 3", "Counsellor 4"]
const BONUS_STATUSES = ["Unpaid", "Ready for Bonus", "Paid"]

// 简单的密码验证
function verifyLogin(name, password) {
  if (name === "Manager" && password === "admin123") {
    return { role: "manager", counsellor: null }
  }
  // 顧問密碼（隨機生成）
  const counsellorPasswords = {
    "Counsellor 1": "817497C0",
    "Counsellor 2": "172BEADB",
    "Counsellor 3": "8E919AC2",
    "Counsellor 4": "349F9C24"
  }
  if (COUNSELLORS.includes(name) && counsellorPasswords[name] === password) {
    return { role: "counsellor", counsellor: name }
  }
  return null
}

export default function Home() {
  // 登录状态
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loginForm, setLoginForm] = useState({ name: "", password: "" })
  const [loginError, setLoginError] = useState("")

  // 用户信息
  const [user, setUser] = useState({ role: "", counsellor: "" })

  // CRM 数据
  const [students, setStudents] = useState([])
  const [settings] = useState({ defaultBonus: 1, bonusOptions: [0.2, 0.5, 1] })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("students")
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [filters, setFilters] = useState({ search: "", status: "All", source: "All", year: "All", bonusStatus: "All" })

  const [formData, setFormData] = useState({
    id: "", studentName: "", counsellor: "", school: "", course: "",
    source: "Referral", status: "Lead", intakeDate: "", visaExpiryDate: "", tuition: "",
    bonus: 500, notes: "", isUrgent: false
  })

  // 检查本地存储的登录状态
  useEffect(() => {
    const savedUser = localStorage.getItem("crm_user")
    if (savedUser) {
      const parsed = JSON.parse(savedUser)
      setUser(parsed)
      setIsLoggedIn(true)
    }
  }, [])

  // 登录处理
  function handleLogin(e) {
    e.preventDefault()
    const result = verifyLogin(loginForm.name, loginForm.password)
    if (result) {
      setUser(result)
      setIsLoggedIn(true)
      localStorage.setItem("crm_user", JSON.stringify(result))
      setLoginError("")
    } else {
      setLoginError("用户名或密码错误")
    }
  }

  // 登出
  function handleLogout() {
    setIsLoggedIn(false)
    setUser({ role: "", counsellor: "" })
    localStorage.removeItem("crm_user")
  }

  // 加载数据
  useEffect(() => {
    if (isLoggedIn) {
      loadData()
    }
  }, [isLoggedIn])

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) {
      // 根据权限过滤数据
      let filtered = data || []
      if (user.role === "counsellor") {
        filtered = filtered.filter(s => s.counsellor === user.counsellor)
      }
      setStudents(filtered)
    }
    setLoading(false)
  }

  async function saveStudent(student) {
    const old = editingId ? students.find(s => s.id === editingId) : null

    // 顾问只能保存自己的学生
    const saveCounsellor = user.role === "manager"
      ? student.counsellor
      : user.counsellor

    // 如果狀態為 Enrolled 或 Lost，自動取消緊急標記
    const shouldCancelUrgent = student.status === "Enrolled" || student.status === "Lost"
    const finalIsUrgent = shouldCancelUrgent ? false : (student.isUrgent || false)

    // 新增時生成 ID，編輯時用原有 ID
    let studentId = student.id
    if (!editingId || !studentId) {
      studentId = await generateStudentID()
    }

    let payload = {
      id: studentId,
      student_name: student.studentName,
      counsellor: saveCounsellor,
      school: student.school,
      course: student.course,
      source: student.source,
      status: student.status,
      intake_date: student.intakeDate || null,
      visa_expiry_date: student.visaExpiryDate || null,
      tuition: Number(student.tuition || 0),
      bonus: Number(student.bonus || settings.defaultBonus),
      bonus_status: old?.bonus_status || "Unpaid",
      paid_at: old?.paid_at || null,
      notes: student.notes,
      is_urgent: finalIsUrgent
    }

    // 新增用 insert（檢查衝突），編輯用 upsert
    let error
    if (editingId) {
      const result = await supabase.from('students').upsert(payload, { onConflict: 'id' })
      error = result.error
    } else {
      let result = await supabase.from('students').insert(payload)
      // 如果是 ID 衝突，自動重試生成新 ID
      let retryCount = 0
      while (result.error && result.error.code === '23505') {
        retryCount++
        console.log(`ID 衝突，第${retryCount}次重試...`)
        const newId = await generateStudentID()
        console.log(`重試生成新ID: ${newId}`)
        payload = { ...payload, id: newId }
        result = await supabase.from('students').insert(payload)
      }
      if (retryCount > 0) {
        console.log(`重試${retryCount}次後成功`)
      }
      error = result.error
    }

    if (!error) {
      await loadData()
      setModalOpen(false)
    } else {
      alert('保存失敗: ' + error.message)
    }
  }

  async function deleteStudent(id) {
    if (!confirm('确定删除？')) return
    await supabase.from('students').delete().eq('id', id)
    await loadData()
  }

  // ==================== 報表導出功能 ====================
  function exportToCSV(data, filename) {
    if (data.length === 0) {
      alert('沒有數據可導出')
      return
    }

    const headers = [
      'ID', 'Student Name', 'Counsellor', 'School', 'Course',
      'Source', 'Status', 'Intake Date', 'Visa Expiry Date', 'Tuition (AUD)',
      'Bonus', 'Bonus Status', 'Paid At', 'Notes', 'Is Urgent', 'Created At'
    ]

    const rows = data.map(s => [
      s.id,
      s.student_name,
      s.counsellor,
      s.school,
      s.course,
      s.source,
      s.status,
      s.intake_date || '',
      s.visa_expiry_date || '',
      s.tuition || 0,
      s.bonus || settings.defaultBonus,
      s.bonus_status || 'Unpaid',
      s.paid_at ? fmtDateTime(s.paid_at) : '',
      (s.notes || '').replace(/"/g, '""'),
      s.is_urgent ? 'Yes' : 'No',
      fmtDateTime(s.created_at)
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(cell => {
        const str = String(cell || '')
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(','))
      .join('\n')

    downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8;')
  }

  function exportToExcel(data, filename) {
    if (data.length === 0) {
      alert('沒有數據可導出')
      return
    }

    // 創建 HTML 表格用於 Excel 導出
    const headers = [
      'ID', 'Student Name', 'Counsellor', 'School', 'Course',
      'Source', 'Status', 'Intake Date', 'Visa Expiry Date', 'Tuition (AUD)',
      'Bonus', 'Bonus Status', 'Paid At', 'Notes', 'Created At'
    ]

    const rows = data.map(s => `
      <tr>
        <td>${s.id}</td>
        <td>${s.student_name}</td>
        <td>${s.counsellor}</td>
        <td>${s.school}</td>
        <td>${s.course}</td>
        <td>${s.source}</td>
        <td>${s.status}</td>
        <td>${s.intake_date || ''}</td>
        <td>${s.visa_expiry_date || ''}</td>
        <td>${s.tuition || 0}</td>
        <td>${s.bonus || settings.defaultBonus}</td>
        <td>${s.bonus_status || 'Unpaid'}</td>
        <td>${s.paid_at ? fmtDateTime(s.paid_at) : ''}</td>
        <td>${(s.notes || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
        <td>${fmtDateTime(s.created_at)}</td>
      </tr>
    `).join('')

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8">
        <style>
          table { border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #2563eb; color: white; font-weight: bold; }
          tr:nth-child(even) { background-color: #f8fafc; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
      </html>
    `

    downloadFile(html, `${filename}.xls`, 'application/vnd.ms-excel;charset=utf-8;')
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob(['\ufeff' + content], { type: mimeType })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  function getExportData() {
    // 根據當前篩選條件導出數據
    return visibleStudents
  }

  function getExportFilename() {
    const date = new Date().toISOString().split('T')[0]
    const activeFilters = []
    if (filters.status !== 'All') activeFilters.push(filters.status)
    if (filters.year !== 'All') activeFilters.push(filters.year)
    if (filters.bonusStatus !== 'All') activeFilters.push(filters.bonusStatus)
    const filterStr = activeFilters.length > 0 ? `-${activeFilters.join('-')}` : ''
    return `CRM-Report${filterStr}-${date}`
  }

  async function markReady(id) {
    const s = students.find(x => x.id === id)
    // 顾问只能操作自己的学生
    if (user.role === "counsellor" && s.counsellor !== user.counsellor) return

    const newStatus = s.bonus_status === "Ready for Bonus" ? "Unpaid" : "Ready for Bonus"
    await supabase.from('students').update({
      bonus_status: newStatus,
      paid_at: null
    }).eq('id', id)
    await loadData()
  }

  async function markPaid(id) {
    const s = students.find(x => x.id === id)
    const newStatus = s.bonus_status === "Paid" ? "Unpaid" : "Paid"
    await supabase.from('students').update({
      bonus_status: newStatus,
      paid_at: newStatus === "Paid" ? new Date().toISOString() : null
    }).eq('id', id)
    await loadData()
  }

  // ==================== 緊急標記功能 ====================
  async function toggleUrgent(id) {
    const s = students.find(x => x.id === id)
    // 顧問只能標記自己的學生
    if (user.role === "counsellor" && s.counsellor !== user.counsellor) {
      alert("您只能標記自己的學生")
      return
    }

    const newUrgentStatus = !s.is_urgent
    console.log('切換緊急狀態:', id, '新狀態:', newUrgentStatus)
    
    const { error } = await supabase.from('students').update({
      is_urgent: newUrgentStatus
    }).eq('id', id)
    
    if (error) {
      console.error('更新緊急狀態失敗:', error)
      alert('更新失敗: ' + error.message)
      return
    }
    
    console.log('更新成功')
    await loadData()
  }

  async function generateStudentID() {
    const year = new Date().getFullYear()
    // 從數據庫獲取所有學生ID（不只是當前用戶可見的）
    const { data: allStudents, error } = await supabase
      .from('students')
      .select('id')
      .ilike('id', `STU-${year}-%`)
    
    if (error) {
      console.error('獲取學生ID失敗:', error)
    }
    
    const regex = new RegExp(`^STU-${year}-(\\d{4})$`)
    let maxNum = 0
    const studentList = allStudents || students
    studentList.forEach(s => {
      const m = String(s.id || "").match(regex)
      if (m) maxNum = Math.max(maxNum, Number(m[1]))
    })
    const newId = `STU-${year}-${String(maxNum + 1).padStart(4, "0")}`
    console.log('生成新ID:', newId, '基於最大號:', maxNum)
    return newId
  }

  function getRecordYear(s) {
    if (s.id && /^STU-\d{4}-\d{4}$/.test(s.id)) return s.id.slice(4, 8)
    if (s.intake_date) return String(new Date(s.intake_date).getFullYear())
    return "Unknown"
  }

  async function openModal(editId = null) {
    setEditingId(editId)
    if (editId) {
      const s = students.find(x => x.id === editId)
      setFormData({
        id: s.id,
        studentName: s.student_name,
        counsellor: s.counsellor,
        school: s.school,
        course: s.course,
        source: s.source,
        status: s.status,
        intakeDate: s.intake_date || "",
        visaExpiryDate: s.visa_expiry_date || "",
        tuition: s.tuition,
        bonus: s.bonus,
        notes: s.notes || "",
        isUrgent: s.is_urgent || false
      })
    } else {
      setFormData({
        id: "",
        studentName: "",
        counsellor: user.role === "manager" ? COUNSELLORS[0] : user.counsellor,
        school: "",
        course: "",
        source: "Referral",
        status: "Lead",
        intakeDate: "",
        visaExpiryDate: "",
        tuition: "",
        bonus: settings.defaultBonus,
        notes: "",
        isUrgent: false
      })
    }
    setModalOpen(true)
  }

  async function handleSave() {
    await saveStudent(formData)
  }

  function currency(n) {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(Number(n || 0))
  }

  function fmtDateTime(v) {
    if (!v) return "-"
    const d = new Date(v)
    if (isNaN(d.getTime())) return "-"
    return new Intl.DateTimeFormat("en-AU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d)
  }

  // 过滤数据
  const visibleStudents = students.filter(s => {
    if (filters.search && !(
      (s.student_name || "").toLowerCase().includes(filters.search.toLowerCase()) ||
      (s.school || "").toLowerCase().includes(filters.search.toLowerCase()) ||
      (s.course || "").toLowerCase().includes(filters.search.toLowerCase()) ||
      (s.id || "").toLowerCase().includes(filters.search.toLowerCase())
    )) return false
    if (filters.status !== "All" && s.status !== filters.status) return false
    if (filters.source !== "All" && s.source !== filters.source) return false
    if (filters.year !== "All" && getRecordYear(s) !== filters.year) return false
    if (filters.bonusStatus !== "All" && s.bonus_status !== filters.bonusStatus) return false
    return true
  })

  const enrolled = visibleStudents.filter(s => s.status === "Enrolled")
  const pipeline = visibleStudents.filter(s => !["Enrolled", "Lost"].includes(s.status))
  const totalBonus = enrolled.reduce((a, s) => a + (s.bonus || settings.defaultBonus), 0)
  const paidBonus = enrolled.filter(s => s.bonus_status === "Paid").reduce((a, s) => a + (s.bonus || settings.defaultBonus), 0)
  const years = [...new Set(students.map(getRecordYear))].sort((a, b) => String(b).localeCompare(String(a)))

  // ==================== 登录页面 ====================
  if (!isLoggedIn) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '32px' }}>
          <h1 style={{ textAlign: 'center', marginBottom: '8px' }}>GC EDU CRM</h1>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '24px' }}>请登录</p>

          <form onSubmit={handleLogin}>
            <div className="field" style={{ marginBottom: '16px' }}>
              <label>用户名</label>
              <select
                value={loginForm.name}
                onChange={e => setLoginForm({...loginForm, name: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                required
              >
                <option value="">请选择</option>
                <option value="Manager">Manager</option>
                {COUNSELLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="field" style={{ marginBottom: '24px' }}>
              <label>密码</label>
              <input
                type="password"
                placeholder="输入密码"
                value={loginForm.password}
                onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                required
              />
            </div>

            {loginError && (
              <div style={{ color: '#dc2626', marginBottom: '16px', textAlign: 'center' }}>
                {loginError}
              </div>
            )}

            <button type="submit" className="btn" style={{ width: '100%' }}>
              登录
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ==================== CRM 主页面 ====================
  if (loading) return <div className="page"><p>加载中...</p></div>

  return (
    <div className="page">
      {/* Header */}
      <div className="header card">
        <div>
          <h1>GC EDU CRM</h1>
          <p>{user.role === "manager" ? "管理员视图 - 查看全部数据" : `顾问视图 - ${user.counsellor}`}</p>
        </div>
        <div className="header-actions">
          <div style={{ textAlign: 'right', marginRight: '16px' }}>
            <div style={{ fontWeight: 600 }}>{user.role === "manager" ? "Manager" : user.counsellor}</div>
            <button onClick={handleLogout} style={{ fontSize: '12px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
              退出登录
            </button>
          </div>
          <button className="btn" onClick={() => openModal()}>新增学生</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpis">
        <div className="card kpi">
          <div className="kpi-title">学生总数</div>
          <div className="kpi-value">{visibleStudents.length}</div>
          <div className="kpi-sub">{user.role === "manager" ? "全公司数据" : "我的学生"}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-title">已入学</div>
          <div className="kpi-value">{enrolled.length}</div>
          <div className="kpi-sub">转化率 {visibleStudents.length ? Math.round(enrolled.length / visibleStudents.length * 100) : 0}%</div>
        </div>
        <div className="card kpi">
          <div className="kpi-title">跟进中</div>
          <div className="kpi-value">{pipeline.length}</div>
          <div className="kpi-sub">未完成的 pipeline</div>
        </div>
        <div className="card kpi">
          <div className="kpi-title">总 Bonus</div>
          <div className="kpi-value">{currency(totalBonus)}</div>
          <div className="kpi-sub">已支付 {currency(paidBonus)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === "students" ? "active" : ""}`} onClick={() => setActiveTab("students")}>Students</button>
        {user.role === "manager" && (
          <button className={`tab ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>Dashboard</button>
        )}
        <button className={`tab ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")}>Settings</button>
      </div>

      {/* Students Tab */}
      {activeTab === "students" && (
        <div className="card">
          <div className="section-head">
            <h2>学生管理</h2>
            <div className="filters filters-5">
              <input placeholder="搜索学生 / 学校 / 课程 / ID"
                value={filters.search}
                onChange={e => setFilters({...filters, search: e.target.value})} />
              <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                <option value="All">All Status</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.source} onChange={e => setFilters({...filters, source: e.target.value})}>
                <option value="All">All Sources</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.bonusStatus} onChange={e => setFilters({...filters, bonusStatus: e.target.value})}>
                <option value="All">Bonus Status</option>
                {BONUS_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.year} onChange={e => setFilters({...filters, year: e.target.value})}>
                <option value="All">All Years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Manager 導出按鈕 */}
          {user.role === "manager" && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '12px', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#475569' }}>📊 報表導出:</span>
              <button
                className="btn secondary"
                onClick={() => exportToCSV(getExportData(), getExportFilename())}
                style={{ padding: '8px 14px', fontSize: '14px' }}
              >
                📄 導出 CSV
              </button>
              <button
                className="btn secondary"
                onClick={() => exportToExcel(getExportData(), getExportFilename())}
                style={{ padding: '8px 14px', fontSize: '14px' }}
              >
                📑 導出 Excel
              </button>
              <span style={{ color: '#64748b', fontSize: '13px', marginLeft: 'auto' }}>
                共 {visibleStudents.length} 條記錄
              </span>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{minWidth: '130px'}}>ID</th>
                  <th style={{minWidth: '140px'}}>Student</th>
                  {user.role === "manager" && <th style={{minWidth: '80px'}}>顾问</th>}
                  <th style={{minWidth: '180px'}}>School / Course</th>
                  <th style={{minWidth: '100px'}}>Status</th>
                  <th style={{minWidth: '100px'}}>Dates</th>
                  <th style={{minWidth: '120px'}}>Bonus</th>
                  <th style={{minWidth: '150px'}}>Notes</th>
                  <th style={{minWidth: '180px'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          color: !!s.is_urgent ? '#dc2626' : 'inherit',
                          fontWeight: !!s.is_urgent ? '700' : '500',
                          background: !!s.is_urgent ? '#fef2f2' : 'transparent',
                          padding: !!s.is_urgent ? '2px 6px' : '0',
                          borderRadius: !!s.is_urgent ? '4px' : '0',
                          border: !!s.is_urgent ? '1px solid #fecaca' : 'none'
                        }}>
                          {s.id}
                          {!!s.is_urgent && ' 🔥'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div><strong>{s.student_name}</strong></div>
                      <div style={{color:"#64748b",fontSize:12}}>{s.source}</div>
                    </td>
                    {user.role === "manager" && <td>{s.counsellor}</td>}
                    <td>
                      <div>{s.school}</div>
                      <div style={{color:"#64748b",fontSize:12}}>{s.course}</div>
                    </td>
                    <td><span className={`badge ${s.status === "Enrolled" ? "ready" : ""}`}>{s.status}</span></td>
                    <td>
                      <div style={{fontSize: '12px', lineHeight: '1.5'}}>
                        <div>
                          <span style={{color: '#64748b'}}>入學:</span> {s.intake_date || "-"}
                        </div>
                        <div>
                          <span style={{color: '#64748b'}}>簽證:</span>{' '}
                          {s.visa_expiry_date ? (
                            <span style={{
                              color: new Date(s.visa_expiry_date) < new Date(Date.now() + 30*24*60*60*1000) ? '#dc2626' : 'inherit',
                              fontWeight: new Date(s.visa_expiry_date) < new Date(Date.now() + 30*24*60*60*1000) ? '600' : '400'
                            }}>
                              {s.visa_expiry_date}
                              {new Date(s.visa_expiry_date) < new Date(Date.now() + 30*24*60*60*1000) && '⚠️'}
                            </span>
                          ) : (
                            "-"
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{fontSize: '13px'}}>
                        <div>{currency(s.bonus)}</div>
                        <div style={{marginTop: '4px'}}>
                          <span className={`badge ${s.bonus_status === "Paid" ? "paid" : s.bonus_status === "Ready for Bonus" ? "ready" : ""}`}>
                            {s.bonus_status}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{maxWidth: '200px', fontSize: '13px', color: '#475569', lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>
                        {s.notes ? (
                          s.notes.length > 100 ? s.notes.substring(0, 100) + '...' : s.notes
                        ) : (
                          <span style={{color: '#94a3b8'}}>-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="action-group">
                        {s.status === "Enrolled" && user.role === "counsellor" && s.bonus_status !== "Paid" && (
                          <button className="small-btn primary" onClick={() => markReady(s.id)}>
                            {s.bonus_status === "Ready for Bonus" ? "Undo Ready" : "Mark Ready"}
                          </button>
                        )}
                        {s.status === "Enrolled" && user.role === "manager" && (
                          <button className="small-btn primary" onClick={() => markPaid(s.id)}>
                            {s.bonus_status === "Paid" ? "Undo Paid" : "Mark Paid"}
                          </button>
                        )}
                        <button className="small-btn" onClick={() => openModal(s.id)}>Edit</button>
                        <button
                          className="small-btn"
                          onClick={() => toggleUrgent(s.id)}
                          style={{
                            background: !!s.is_urgent ? '#fef2f2' : '#fff',
                            borderColor: !!s.is_urgent ? '#ef4444' : '#e2e8f0',
                            color: !!s.is_urgent ? '#dc2626' : '#64748b'
                          }}
                          title={!!s.is_urgent ? "取消緊急標記" : "標記為緊急"}
                        >
                          {!!s.is_urgent ? '🔥 取消緊急' : '標記緊急'}
                        </button>
                        {user.role === "manager" && (
                          <button className="small-btn danger" onClick={() => deleteStudent(s.id)}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dashboard Tab (仅 Manager) */}
      {activeTab === "dashboard" && user.role === "manager" && (
        <>
          {/* 導出按鈕區域 */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '12px', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>📊 全部數據導出:</span>
            <button
              className="btn secondary"
              onClick={() => exportToCSV(students, `CRM-All-Data-${new Date().toISOString().split('T')[0]}`)}
              style={{ padding: '8px 14px', fontSize: '14px' }}
            >
              📄 導出全部 CSV
            </button>
            <button
              className="btn secondary"
              onClick={() => exportToExcel(students, `CRM-All-Data-${new Date().toISOString().split('T')[0]}`)}
              style={{ padding: '8px 14px', fontSize: '14px' }}
            >
              📑 導出全部 Excel
            </button>
            <span style={{ color: '#64748b', fontSize: '13px', marginLeft: 'auto' }}>
              全部 {students.length} 條記錄
            </span>
          </div>

          <div className="dashboard-grid">
            <div className="card">
              <h2>Pipeline overview</h2>
            {STATUSES.map(st => {
              const count = students.filter(s => s.status === st).length
              const total = students.length || 1
              const pct = Math.round(count / total * 100)
              return (
                <div className="pipeline-row" key={st}>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span>{st}</span>
                    <span style={{color:"#64748b"}}>{count} students</span>
                  </div>
                  <div className="progress"><div style={{width:`${pct}%`}}></div></div>
                </div>
              )
            })}
            </div>
            <div className="card">
              <h2>顾问排行榜</h2>
            {COUNSELLORS.map((c, i) => {
              const mine = students.filter(s => s.counsellor === c)
              const enrolled = mine.filter(s => s.status === "Enrolled")
              const bonus = enrolled.reduce((a, s) => a + (s.bonus || settings.defaultBonus), 0)
              return (
                <div className="rank-card" key={c}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:12}}>
                    <div>
                      <div style={{fontSize:12,color:"#64748b"}}>#{i+1}</div>
                      <div style={{fontWeight:700}}>{c}</div>
                      <div style={{fontSize:12,color:"#64748b"}}>{enrolled.length} enrolled / {mine.length} students</div>
                    </div>
                    <div style={{fontWeight:700}}>{currency(bonus)}</div>
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        </>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="settings-grid">
          <div className="card">
            <h2>我的信息</h2>
            <div className="info-box">
              <p><strong>角色：</strong>{user.role === "manager" ? "管理员" : "顾问"}</p>
              {user.role === "counsellor" && <p><strong>顾问名字：</strong>{user.counsellor}</p>}
              <p><strong>学生总数：</strong>{students.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="modal" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal-card">
            <div className="modal-head">
              <h3>{editingId ? "Edit student" : "Add new student"}</h3>
              <button className="icon-btn" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="field"><label>Student ID</label><input value={formData.id || "(自動生成)"} disabled style={{ color: formData.id ? 'inherit' : '#94a3b8' }} /></div>
              <div className="field"><label>Student name</label><input value={formData.studentName} onChange={e => setFormData({...formData, studentName: e.target.value})} /></div>
              {user.role === "manager" && (
                <div className="field">
                  <label>Counsellor</label>
                  <select value={formData.counsellor} onChange={e => setFormData({...formData, counsellor: e.target.value})}>
                    {COUNSELLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="field"><label>School</label><input value={formData.school} onChange={e => setFormData({...formData, school: e.target.value})} /></div>
              <div className="field"><label>Course</label><input value={formData.course} onChange={e => setFormData({...formData, course: e.target.value})} /></div>
              <div className="field">
                <label>Lead source</label>
                <select value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})}>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Intake date</label><input type="date" value={formData.intakeDate} onChange={e => setFormData({...formData, intakeDate: e.target.value})} /></div>
              <div className="field"><label>Visa expiry date</label><input type="date" value={formData.visaExpiryDate} onChange={e => setFormData({...formData, visaExpiryDate: e.target.value})} /></div>
              <div className="field"><label>Tuition (AUD)</label><input type="number" value={formData.tuition} onChange={e => setFormData({...formData, tuition: e.target.value})} /></div>
              <div className="field">
                <label>Bonus</label>
                <select value={formData.bonus} onChange={e => setFormData({...formData, bonus: Number(e.target.value)})}>
                  {settings.bonusOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={formData.isUrgent}
                    onChange={e => setFormData({...formData, isUrgent: e.target.checked})}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <span style={{ color: formData.isUrgent ? '#dc2626' : '#475569', fontWeight: formData.isUrgent ? '600' : '400' }}>
                    🔥 標記為緊急
                  </span>
                </label>
              </div>
              <div className="field full"><label>Notes</label><textarea rows={4} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} /></div>
            </div>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
