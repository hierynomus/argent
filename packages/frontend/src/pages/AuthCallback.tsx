import { useEffect } from "react"
import { useAuth } from "react-oidc-context"
import { useNavigate } from "react-router-dom"

export default function AuthCallback() {
  const auth = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated) {
      navigate("/", { replace: true })
    }
  }, [auth.isLoading, auth.isAuthenticated, navigate])

  if (auth.error) {
    return (
      <div className="flex h-screen items-center justify-center text-red-500">
        Authentication failed: {auth.error.message}
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center text-gray-500">
      Completing sign in…
    </div>
  )
}
