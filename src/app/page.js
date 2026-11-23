import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader><CardTitle>Edgelink SEO Automation Dashboard</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Scaffold is working.</p>
          <Button>Setup OK</Button>
        </CardContent>
      </Card>
    </main>
  );
}
