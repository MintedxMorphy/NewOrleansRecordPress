import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Header } from '@/components/header'
import { getTeamMembers } from '@/lib/team-data'

export const metadata: Metadata = {
  title: 'Our Team | New Orleans Record Press',
  description: 'The people behind every groove. Meet the NORP team.',
}

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const members = await getTeamMembers()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="h-16" />

      {/* Hero block */}
      <div className="border-b border-border px-6 md:px-16 lg:px-32 py-12 md:py-16 max-w-none">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-primary mb-6">The Team</p>
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-none tracking-tight text-foreground max-w-4xl">
          The People Behind<br />
          <span className="text-primary">Every Groove.</span>
        </h1>
      </div>

      {/* Team grid */}
      <div className="px-6 md:px-16 lg:px-32 py-10 md:py-14">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-8 gap-y-12">
          {members.map((member) => (
            <div key={member.id} className="flex flex-col items-center text-center group">
              {/* Avatar */}
              <div className="w-48 h-48 md:w-56 md:h-56 rounded-full overflow-hidden bg-muted border border-border mb-5 flex items-center justify-center flex-shrink-0">
                {member.image ? (
                  <Image
                    src={member.image}
                    alt={member.name}
                    width={224}
                    height={224}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: 'center' }}
                  />
                ) : (
                  <span className="text-6xl font-bold text-muted-foreground select-none">
                    {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                )}
              </div>

              {/* Info */}
              <p className="font-bold text-sm text-foreground leading-tight mb-1">{member.name}</p>
              <p className="text-xs text-primary font-mono uppercase tracking-wide mb-1">{member.title}</p>
              <p className="text-xs text-muted-foreground leading-snug">{member.department}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-20 pt-12 border-t border-border flex flex-col sm:flex-row gap-4 items-start">
          <Link
            href="/#contact"
            className="px-8 py-4 bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm hover:bg-primary/90 transition-all inline-flex items-center gap-2 rounded-lg"
          >
            Work With Us
          </Link>
        </div>
      </div>
    </div>
  )
}
