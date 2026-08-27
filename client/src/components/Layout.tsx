import { Outlet } from 'react-router-dom'
import Header from './Header'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden">
      <Header />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 xl:px-[2cm]">
        <Outlet />
      </main>
    </div>
  )
}
