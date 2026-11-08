import java.io.File;
import javax.imageio.ImageIO;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
public class DecodeEpiQr {
 public static void main(String[] args) throws Exception {
  for(String path:args){var image=ImageIO.read(new File(path));int w=image.getWidth(),h=image.getHeight();
   var source=new RGBLuminanceSource(w,h,image.getRGB(0,0,w,h,null,0,w));
   String text=new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
   if(!text.equals("https://luidgi8al-del.github.io/alex-eps-import/?epi=epi-school-bau-017#equipement"))throw new AssertionError(text);
   System.out.println("PASS decoded QR: "+path+" -> "+text);
  }
 }
}
