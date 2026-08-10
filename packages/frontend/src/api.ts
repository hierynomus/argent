import type {
  Account,
  AccountWithMembers,
  AddLoanMemberBody,
  AddMortgageMemberBody,
  AddPortfolioMemberBody,
  AdminSharingResponse,
  Category,
  CreateCategoryBody,
  CreateCryptoTradeBody,
  CreateMetalLotBody,
  CreateMetalSaleBody,
  CreateLoanBody,
  CreateLoanExtraPaymentBody,
  CreateLoanPartBody,
  CreateMortgageBody,
  CreateMortgageExtraPaymentBody,
  CreateMortgagePartBody,
  CreatePortfolioBody,
  CryptoTrade,
  ImportResult,
  ImportZipResult,
  LinkTransferBody,
  LoanMember,
  MetalLot,
  MetalPortfolioDetail,
  MetalSale,
  Loan,
  LoanExtraPayment,
  LoanPart,
  LoanWithParts,
  Mortgage,
  MortgageExtraPayment,
  MortgageMember,
  MortgagePart,
  MortgageWithParts,
  PaginatedResponse,
  Portfolio,
  PortfolioDetail,
  PortfolioMember,
  PortfolioWithAccess,
  CreateSubscriptionBody,
  CreateStockDividendBody,
  CreateStockTradeBody,
  StockDividend,
  StockLookup,
  StockPortfolioDetail,
  StockTrade,
  Subscription,
  TransactionFilters,
  TransactionWithDetails,
  TransferPeerSummary,
  UpdateAccountBody,
  UpdateLoanPartBody,
  UpdateMortgagePartBody,
  UpdateSubscriptionBody,
  UpdateTransactionBody,
  UserProfile,
} from "@argent/shared"

const BASE = "/api"

async function request<T>(
  path: string,
  options: RequestInit & { token: string }
): Promise<T> {
  const { token, ...init } = options
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? "Request failed")
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

// Me
export const getMe = (token: string) =>
  request<UserProfile>("/me", { token })

export const updateMe = (token: string, settings: { theme?: "light" | "dark" | "system" }) =>
  request<UserProfile>("/me", { token, method: "PATCH", body: JSON.stringify(settings) })

// Accounts
export const getAccounts = (token: string) =>
  request<Account[]>("/accounts", { token })

export const updateAccount = (token: string, id: string, body: UpdateAccountBody) =>
  request<Account>(`/accounts/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(body),
  })

// Transactions
type TransactionQuery = TransactionFilters & { accountIds?: string[] }
export const getTransactions = (token: string, filters: TransactionQuery) => {
  const { accountIds, ...rest } = filters
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v))
  }
  if (accountIds?.length) params.set("accountIds", accountIds.join(","))
  return request<PaginatedResponse<TransactionWithDetails>>(
    `/transactions?${params}`,
    { token }
  )
}

export const updateTransaction = (
  token: string,
  id: string,
  body: UpdateTransactionBody
) =>
  request<TransactionWithDetails>(`/transactions/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(body),
  })

export const getTransferSuggestions = (token: string, id: string) =>
  request<TransferPeerSummary[]>(`/transactions/${id}/transfer-suggestions`, { token })

export const linkTransfer = (token: string, id: string, body: LinkTransferBody) =>
  request<TransactionWithDetails>(`/transactions/${id}/transfer`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  })

export const unlinkTransfer = (token: string, id: string) =>
  request<void>(`/transactions/${id}/transfer`, { token, method: "DELETE" })

// Categories
export const getCategories = (token: string) =>
  request<Category[]>("/categories", { token })

export const createCategory = (token: string, body: CreateCategoryBody) =>
  request<Category>("/categories", {
    token,
    method: "POST",
    body: JSON.stringify(body),
  })

export const deleteCategory = (token: string, id: string) =>
  request<void>(`/categories/${id}`, { token, method: "DELETE" })

// Subscriptions
export const getSubscriptions = (token: string) =>
  request<Subscription[]>("/subscriptions", { token })

export const createSubscription = (token: string, body: CreateSubscriptionBody) =>
  request<Subscription>("/subscriptions", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

export const updateSubscription = (token: string, id: string, body: UpdateSubscriptionBody) =>
  request<Subscription>(`/subscriptions/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(body),
  })

export const deleteSubscription = (token: string, id: string) =>
  request<void>(`/subscriptions/${id}`, { token, method: "DELETE" })

export const runSubscriptionDetection = (token: string) =>
  request<{ detected: number }>("/subscriptions/detect", { token, method: "POST" })

export const getSubscriptionTransactions = (token: string, id: string) =>
  request<Array<{
    id: string
    bookingDate: string
    amount: string
    currency: string
    creditDebitIndicator: string
    description: string | null
  }>>(`/subscriptions/${id}/transactions`, { token })

// Admin
export const getAdminAccounts = (token: string) =>
  request<AccountWithMembers[]>("/admin/accounts", { token })

export const addMember = (
  token: string,
  accountId: string,
  groupName: string,
  role: "viewer" | "editor" = "viewer",
) =>
  request<{ accountId: string; groupName: string; role: string }>(`/admin/accounts/${accountId}/members`, {
    token,
    method: "POST",
    body: JSON.stringify({ groupName, role }),
  })

export const removeMember = (token: string, accountId: string, groupName: string) =>
  request<void>(`/admin/accounts/${accountId}/members/${encodeURIComponent(groupName)}`, { token, method: "DELETE" })

export const updateAccountOwner = (token: string, accountId: string, ownerSub: string | null) =>
  request<Account>(`/admin/accounts/${accountId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify({ ownerSub }),
  })

// Crypto portfolios
export const getCryptoPortfolios = (token: string) =>
  request<PortfolioWithAccess[]>("/crypto", { token })

export const getCryptoPortfolio = (token: string, id: string) =>
  request<PortfolioDetail>(`/crypto/${id}`, { token })

export const createCryptoPortfolio = (token: string, body: CreatePortfolioBody) =>
  request<Portfolio>("/crypto", { token, method: "POST", body: JSON.stringify(body) })

export const deleteCryptoPortfolio = (token: string, id: string) =>
  request<void>(`/crypto/${id}`, { token, method: "DELETE" })

export const addCryptoTrade = (token: string, portfolioId: string, body: CreateCryptoTradeBody) =>
  request<CryptoTrade>(`/crypto/${portfolioId}/trades`, { token, method: "POST", body: JSON.stringify(body) })

export const addCryptoPortfolioMember = (token: string, portfolioId: string, body: AddPortfolioMemberBody) =>
  request<PortfolioMember>(`/crypto/${portfolioId}/members`, { token, method: "POST", body: JSON.stringify(body) })

export const removeCryptoPortfolioMember = (token: string, portfolioId: string, groupName: string) =>
  request<void>(`/crypto/${portfolioId}/members/${encodeURIComponent(groupName)}`, { token, method: "DELETE" })

// Metals portfolios
export const getMetalPortfolios = (token: string) =>
  request<PortfolioWithAccess[]>("/metals", { token })

export const getMetalPortfolio = (token: string, id: string) =>
  request<MetalPortfolioDetail>(`/metals/${id}`, { token })

export const createMetalPortfolio = (token: string, body: CreatePortfolioBody) =>
  request<Portfolio>("/metals", { token, method: "POST", body: JSON.stringify(body) })

export const deleteMetalPortfolio = (token: string, id: string) =>
  request<void>(`/metals/${id}`, { token, method: "DELETE" })

export const addMetalPortfolioMember = (token: string, portfolioId: string, body: AddPortfolioMemberBody) =>
  request<PortfolioMember>(`/metals/${portfolioId}/members`, { token, method: "POST", body: JSON.stringify(body) })

export const removeMetalPortfolioMember = (token: string, portfolioId: string, groupName: string) =>
  request<void>(`/metals/${portfolioId}/members/${encodeURIComponent(groupName)}`, { token, method: "DELETE" })

export const addMetalLot = (token: string, portfolioId: string, body: CreateMetalLotBody) =>
  request<MetalLot>(`/metals/${portfolioId}/lots`, { token, method: "POST", body: JSON.stringify(body) })

export const addMetalSale = (token: string, portfolioId: string, lotId: string, body: CreateMetalSaleBody) =>
  request<MetalSale>(`/metals/${portfolioId}/lots/${lotId}/sales`, { token, method: "POST", body: JSON.stringify(body) })

// Stocks portfolios
export const getStockPortfolios = (token: string) =>
  request<PortfolioWithAccess[]>("/stocks", { token })

export const getStockPortfolio = (token: string, id: string) =>
  request<StockPortfolioDetail>(`/stocks/${id}`, { token })

export const createStockPortfolio = (token: string, body: CreatePortfolioBody) =>
  request<Portfolio>("/stocks", { token, method: "POST", body: JSON.stringify(body) })

export const deleteStockPortfolio = (token: string, id: string) =>
  request<void>(`/stocks/${id}`, { token, method: "DELETE" })

export const addStockTrade = (token: string, portfolioId: string, body: CreateStockTradeBody) =>
  request<StockTrade>(`/stocks/${portfolioId}/trades`, { token, method: "POST", body: JSON.stringify(body) })

export const lookupStock = (token: string, symbol: string) =>
  request<StockLookup>(`/stocks/lookup/${encodeURIComponent(symbol)}`, { token })

export const addStockDividend = (token: string, portfolioId: string, body: CreateStockDividendBody) =>
  request<StockDividend>(`/stocks/${portfolioId}/dividends`, { token, method: "POST", body: JSON.stringify(body) })

export const deleteStockDividend = (token: string, portfolioId: string, dividendId: string) =>
  request<void>(`/stocks/${portfolioId}/dividends/${dividendId}`, { token, method: "DELETE" })

export const addStockPortfolioMember = (token: string, portfolioId: string, body: AddPortfolioMemberBody) =>
  request<PortfolioMember>(`/stocks/${portfolioId}/members`, { token, method: "POST", body: JSON.stringify(body) })

export const removeStockPortfolioMember = (token: string, portfolioId: string, groupName: string) =>
  request<void>(`/stocks/${portfolioId}/members/${encodeURIComponent(groupName)}`, { token, method: "DELETE" })

// Mortgages
export const getMortgages = (token: string) =>
  request<MortgageWithParts[]>("/mortgages", { token })

export const createMortgage = (token: string, body: CreateMortgageBody) =>
  request<Mortgage>("/mortgages", { token, method: "POST", body: JSON.stringify(body) })

export const deleteMortgage = (token: string, id: string) =>
  request<void>(`/mortgages/${id}`, { token, method: "DELETE" })

export const addMortgagePart = (token: string, mortgageId: string, body: CreateMortgagePartBody) =>
  request<MortgagePart>(`/mortgages/${mortgageId}/parts`, { token, method: "POST", body: JSON.stringify(body) })

export const updateMortgagePart = (token: string, mortgageId: string, partId: string, body: UpdateMortgagePartBody) =>
  request<MortgagePart>(`/mortgages/${mortgageId}/parts/${partId}`, { token, method: "PATCH", body: JSON.stringify(body) })

export const deleteMortgagePart = (token: string, mortgageId: string, partId: string) =>
  request<void>(`/mortgages/${mortgageId}/parts/${partId}`, { token, method: "DELETE" })

export const addMortgageExtraPayment = (token: string, mortgageId: string, partId: string, body: CreateMortgageExtraPaymentBody) =>
  request<MortgageExtraPayment>(`/mortgages/${mortgageId}/parts/${partId}/payments`, { token, method: "POST", body: JSON.stringify(body) })

export const deleteMortgageExtraPayment = (token: string, mortgageId: string, partId: string, paymentId: string) =>
  request<void>(`/mortgages/${mortgageId}/parts/${partId}/payments/${paymentId}`, { token, method: "DELETE" })

export const addMortgageMember = (token: string, mortgageId: string, body: AddMortgageMemberBody) =>
  request<MortgageMember>(`/mortgages/${mortgageId}/members`, { token, method: "POST", body: JSON.stringify(body) })

export const removeMortgageMember = (token: string, mortgageId: string, groupName: string) =>
  request<void>(`/mortgages/${mortgageId}/members/${encodeURIComponent(groupName)}`, { token, method: "DELETE" })

// Loans
export const getLoans = (token: string) =>
  request<LoanWithParts[]>("/loans", { token })

export const createLoan = (token: string, body: CreateLoanBody) =>
  request<Loan>("/loans", { token, method: "POST", body: JSON.stringify(body) })

export const deleteLoan = (token: string, id: string) =>
  request<void>(`/loans/${id}`, { token, method: "DELETE" })

export const addLoanPart = (token: string, loanId: string, body: CreateLoanPartBody) =>
  request<LoanPart>(`/loans/${loanId}/parts`, { token, method: "POST", body: JSON.stringify(body) })

export const updateLoanPart = (token: string, loanId: string, partId: string, body: UpdateLoanPartBody) =>
  request<LoanPart>(`/loans/${loanId}/parts/${partId}`, { token, method: "PATCH", body: JSON.stringify(body) })

export const deleteLoanPart = (token: string, loanId: string, partId: string) =>
  request<void>(`/loans/${loanId}/parts/${partId}`, { token, method: "DELETE" })

export const addLoanExtraPayment = (token: string, loanId: string, partId: string, body: CreateLoanExtraPaymentBody) =>
  request<LoanExtraPayment>(`/loans/${loanId}/parts/${partId}/payments`, { token, method: "POST", body: JSON.stringify(body) })

export const deleteLoanExtraPayment = (token: string, loanId: string, partId: string, paymentId: string) =>
  request<void>(`/loans/${loanId}/parts/${partId}/payments/${paymentId}`, { token, method: "DELETE" })

export const addLoanMember = (token: string, loanId: string, body: AddLoanMemberBody) =>
  request<LoanMember>(`/loans/${loanId}/members`, { token, method: "POST", body: JSON.stringify(body) })

export const removeLoanMember = (token: string, loanId: string, groupName: string) =>
  request<void>(`/loans/${loanId}/members/${encodeURIComponent(groupName)}`, { token, method: "DELETE" })

export const getAdminSharing = (token: string) =>
  request<AdminSharingResponse>("/admin/sharing", { token })

// Backup / Restore
export const downloadBackup = async (token: string): Promise<void> => {
  const res = await fetch(`${BASE}/admin/backup`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error("Backup failed")
  const blob = await res.blob()
  const filename =
    res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1] ??
    "argent-backup.json"
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const restoreBackup = (token: string, data: unknown) =>
  request<{ ok: boolean; restored: Record<string, number> }>("/admin/restore", {
    token,
    method: "POST",
    body: JSON.stringify(data),
  })

// Import
export const importCamt053 = (token: string, file: File) => {
  const form = new FormData()
  form.append("file", file)
  return request<ImportResult>("/import", { token, method: "POST", body: form })
}

export const importCamt053Zip = (token: string, file: File) => {
  const form = new FormData()
  form.append("file", file)
  return request<ImportZipResult>("/import/zip", { token, method: "POST", body: form })
}
