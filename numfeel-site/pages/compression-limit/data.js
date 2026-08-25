// ── 压缩极限 Demo：静态样本数据 ──

/**
 * 样本一：英文散文（原创科普文，约 9KB 纯 ASCII）。
 * 自然语言冗余度高，是 gzip 的主场。
 * @type {string}
 */
var SAMPLE_TEXT = ''
  + 'THE PIGEONHOLE GAZETTE. A FIELD GUIDE TO THE END OF COMPRESSION\n\n'
  + 'CHAPTER ONE. THE PROMISE\n\n'
  + 'Every few years, somewhere in the world, a small company announces a miracle. They have built a program, '
  + 'the founders say, that can take any file and squeeze it to a fraction of its size. Not just some files. '
  + 'Any file. Better still, the trick can be repeated: compress the compressed file again and again, until an '
  + 'entire movie fits inside a single floppy disk, or a whole season of television hides inside one photograph. '
  + 'The demonstrations are always convincing. The investors are always excited. The mathematics, meanwhile, '
  + 'remains completely unmoved.\n\n'
  + 'This is not a story about deliberate fraud, at least not always. Many of these inventors believe their own '
  + 'claims. They have watched their software shrink a spreadsheet from two megabytes to two hundred kilobytes, '
  + 'and they see no reason the same trick could not be applied to its own output. The intuition feels honest '
  + 'enough: if a machine turns one thousand into one hundred, why not feed the machine its own product and '
  + 'continue? The answer is one of the most beautiful and most merciless ideas in all of computer science. '
  + 'It can be explained with pigeons.\n\n'
  + 'CHAPTER TWO. THE PIGEONS\n\n'
  + 'Imagine a mailroom with two hundred and fifty-six wooden pigeonholes, the kind where letters get sorted. '
  + 'Now imagine sixty-five thousand five hundred and thirty-six pigeons walking in, each carrying exactly one '
  + 'letter. It does not matter how cleverly the clerk arranges the birds, or how many assistants he hires, or '
  + 'how patiently the pigeons cooperate. At least two pigeons must share a hole. If every hole is used, the '
  + 'average hole ends up holding two hundred and fifty-six pigeons, packed wing to wing, indistinguishable '
  + 'from one another.\n\n'
  + 'That is the pigeonhole principle, and it is the entire argument against universal compression. A file that '
  + 'is two bytes long can take any of sixty-five thousand five hundred and thirty-six different values. A file '
  + 'that is one byte long can hold only two hundred and fifty-six. If some magical transform squeezed every '
  + 'two-byte file into one byte, then at least two different originals would have to land on the same output. '
  + 'The decompressor, staring at that single lonely byte, would have no way to know which original to '
  + 'resurrect. The data has not been compressed. It has been destroyed.\n\n'
  + 'CHAPTER THREE. THE TAX\n\n'
  + 'Here is a detail that surprises everyone the first time they meet it. Take a text file and compress it. '
  + 'It shrinks, as promised. Now compress the result. It grows. Every layer of gzip wrapped around already '
  + 'compressed data adds about twenty bytes of pure overhead: ten for the header, eight for the checksum '
  + 'trailer, and a few more for bookkeeping. On a file that refuses to shrink, that overhead is a tax paid in '
  + 'full, every single round. Watch the size counter tick upward, byte by byte, each time you press the '
  + 'button. The program is not broken. It is being perfectly honest about what remains: nothing.\n\n'
  + 'People sometimes ask whether a smarter format could avoid the tax. A leaner header helps at the margins, '
  + 'but the tax is not really the point. The point is that the size stops falling. Once the entropy of the '
  + 'data approaches eight bits per byte, every byte is already carrying as much information as a byte can '
  + 'carry. There is no slack left to pull, no air left to squeeze out. A file in that state is '
  + 'mathematically indistinguishable from noise, and noise is the wall.\n\n'
  + 'CHAPTER FOUR. WHY TEXT BENDS AND NOISE DOES NOT\n\n'
  + 'Why does English text compress so well then? Because language is astonishingly redundant. The letter q is '
  + 'almost always followed by u. The word compression is almost always followed by algorithm, ratio, or '
  + 'limits. Entire phrases repeat across paragraphs, and whole sentences repeat across documents. A '
  + 'compressor does not understand any of this. It simply notices that certain patterns occur more often '
  + 'than chance would suggest, and it rewrites the frequent patterns with short codes and the rare ones with '
  + 'long codes. Morse code understood this a century and a half before the first file compressor: in '
  + 'English, a single dot is the most common letter of all.\n\n'
  + 'A photograph, by contrast, has already been through a compressor. Formats like PNG and JPEG hunt down '
  + 'the redundancy in an image at manufacture time and throw most of it away. What lands on your disk is '
  + 'close to pure signal, statistically as dense as noise. That is why zipping a photograph is a '
  + 'disappointing experience: the archive comes out a fraction of a percent larger than the original, the '
  + 'tax again, paid for nothing. And random data, generated by dice or atomic decay or a good cryptographic '
  + 'source, never had any redundancy in the first place. It is the wall itself, wearing a different coat.\n\n'
  + 'CHAPTER FIVE. HOW TO RECOGNIZE THE SCAM\n\n'
  + 'The pattern never changes, and it is worth learning to see it. The demonstration always uses files that '
  + 'compress beautifully: text, spreadsheets, databases, bitmap images never before compressed. The claim '
  + 'always concerns all files, which is precisely what cannot be demonstrated. The proof is always a live '
  + 'show rather than a public algorithm, because a public algorithm could be fed random data by anyone with '
  + 'a coin and a little patience. Ask the inventor to compress ten megabytes of coin flips, in public, with '
  + 'the decompressor standing by, and watch the conversation change subject.\n\n'
  + 'History is generous with examples. In 2002 an American company called Zeosync announced that it had '
  + 'broken the compression barrier, a phrase that is itself a small museum of misunderstanding, and quietly '
  + 'evaporated after the technical community finished laughing. A Dutch inventor named Jan Sloot spent the '
  + 'nineteen nineties promising a box that would store entire films in eight kilobytes; he died of a heart '
  + 'attack the day before the contract that would have validated his technology, and the source code was '
  + 'never found. The details differ. The pigeonholes never do.\n\n'
  + 'CHAPTER SIX. THE HONEST MIRACLE\n\n'
  + 'There is a happy ending hiding here, one that makes the whole subject worth caring about. Real '
  + 'compression is not a trick that fails at the edges; it is a deep result about the structure of the '
  + 'world. Text, music, images, genomes, and language itself are all made of patterns, and patterns are '
  + 'exactly what compression eats. The reason a nine-kilobyte essay can shrink to four is the same reason '
  + 'you can read it at all: it is not random. If it were random, it would carry no meaning, and there would '
  + 'be nothing to compress and nothing to say.\n\n'
  + 'So the next time someone promises you a compressor that works on everything, offer them a friendly '
  + 'wager. Generate one megabyte of fair coin flips together, out in the open. Let their machine do its '
  + 'worst. If the output is even one byte smaller than the input, and still expands back to the original, '
  + 'the drinks are on you. Then sit back, order nothing, and enjoy the rare pleasure of watching mathematics '
  + 'keep an appointment it has never once missed.\n';

/**
 * 样本四：重复文本的构造参数（同一句话重复 SPAM_REPEAT 遍）。
 * @type {string}
 */
var SPAM_UNIT = 'The quick brown fox jumps over the lazy dog. ';

/**
 * 重复次数。
 * @type {number}
 */
var SPAM_REPEAT = 1000;
