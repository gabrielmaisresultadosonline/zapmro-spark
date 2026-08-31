-- Add DELETE policy for mro_orders table to allow admin deletions
CREATE POLICY "Anyone can delete mro orders" 
ON public.mro_orders 
FOR DELETE 
USING (true);