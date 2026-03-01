import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

async function getMonologueStats() {
  const [totalStudents, totalSessions] = await Promise.all([
    prisma.student.count(),
    prisma.session.count(),
  ]);
  return { totalStudents, totalSessions };
}

export default async function HubPage() {
  const monologueStats = await getMonologueStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">SEWAi Analytics Hub</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview of all SEWAi features and analytics
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/monologue-v2/" className="block group">
          <Card className="h-full transition-colors group-hover:border-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Monologue v2</CardTitle>
                <Badge variant="default">Active</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Student monologue session analytics, question completion tracking, and hint usage insights.
              </p>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="font-semibold">{monologueStats.totalSessions}</span>{" "}
                  <span className="text-muted-foreground">sessions</span>
                </div>
                <div>
                  <span className="font-semibold">{monologueStats.totalStudents}</span>{" "}
                  <span className="text-muted-foreground">students</span>
                </div>
              </div>
              <p className="text-xs text-primary font-medium group-hover:underline">
                View Dashboard &rarr;
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className="h-full border-dashed opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Future Feature</CardTitle>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Additional SEWAi features and analytics will appear here as they are developed.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
