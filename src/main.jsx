import React, { Suspense, lazy, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'

const App = lazy(() => import('./App'))
const SimpleApp = lazy(() => import('./simple/SimpleApp'))

function getRoute() {
  return window.location.hash.startsWith('#/simple') ? 'simple' : 'lab'
}

function Root() {
  const [route, setRoute] = useState(getRoute())
  useEffect(() => {
    const onHash = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
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
