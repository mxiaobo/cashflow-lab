import React, { Suspense, lazy, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'

const App = lazy(() => import('./App'))
const SimpleApp = lazy(() => import('./simple/SimpleApp'))

function getRoute() {
  const { hash, pathname } = window.location
  if (hash.startsWith('#/simple') || pathname.startsWith('/simple')) return 'simple'
  return 'lab'
}

function Root() {
  const [route, setRoute] = useState(getRoute())
  useEffect(() => {
    const onChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', onChange)
    window.addEventListener('popstate', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
      window.removeEventListener('popstate', onChange)
    }
  }, [])
  return (
    <Suspense fallback={null}>
      {route === 'simple' ? <SimpleApp /> : <App />}
    </Suspense>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
